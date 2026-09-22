import { KIND_LABELS, type IdentityIndex, type RecordReference } from './identities.ts';
import { CAMPUS_DATA_TOPICS, CAMPUS_GRAPH_SOURCES, IDENTITY_TOPIC_SOURCES, type TopicSources } from './campus-topics.ts';

export interface CampusGraphExportNode {
  id: string;
  type: 'campus' | 'category' | 'identity' | 'record_reference' | 'record_selection';
  [key: string]: unknown;
}
export interface CampusGraphExportEdge {
  id: string;
  from: string;
  to: string;
  type: 'browse' | 'source_link' | 'evidence_relationship';
  [key: string]: unknown;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function validReference(value: unknown): value is RecordReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return ['collection', 'source_key', 'source_record_key'].every(key =>
    typeof reference[key] === 'string' && reference[key].trim().length > 0)
    && (reference.source_record_id === undefined || typeof reference.source_record_id === 'string'
      && reference.source_record_id.trim().length > 0);
}

/** Export the complete loaded registry, independently of the visible graph state. */
export function buildCampusGraphExport(index: IdentityIndex, exportedAt: string) {
  const nodes = new Map<string, CampusGraphExportNode>();
  const edges: CampusGraphExportEdge[] = [];
  const diagnostics: { reason: string; edge_id: string; target_node_id: string }[] = [];
  const rootId = 'campus:ramapo';
  const identityId = (id: string) => `identity:${id}`;
  const identityCategoryId = (kind: string) => `category:identity:${kind}`;
  const identityIds = new Set(index.identities.map(identity => identity.id));
  const relationshipCounts: Record<string, number> = {};
  let sourceLinkGroups = 0;
  let sourceKeyEntries = 0;
  let sourceIdEntries = 0;
  let relationshipCount = 0;
  let evidenceCount = 0;

  function addBrowse(from: string, to: string, action: string) {
    edges.push({ id: `browse:${edges.length}`, type: 'browse', from, to, action });
  }
  function collectionNode(collection: string, label: string) {
    const id = `collection:${encodeURIComponent(collection)}`;
    if (!nodes.has(id)) nodes.set(id, {
      id, type: 'record_selection', selection_kind: 'collection', label,
      selector: { collection }, resolution: 'not_resolved',
    });
    return id;
  }
  function recordNode(selector: Record<string, unknown>, label?: string) {
    const id = `record_reference:${encodeURIComponent(canonicalJson(selector))}`;
    if (!nodes.has(id)) nodes.set(id, {
      id, type: 'record_reference', selector: structuredClone(selector),
      ...(label === undefined ? {} : { label }), resolution: 'not_resolved',
    });
    return id;
  }
  function sourceNavigation(ownerId: string, sources: TopicSources) {
    for (const source of sources.collections) {
      addBrowse(ownerId, collectionNode(source.id, source.label), 'view_source_collection');
    }
    for (const source of sources.artifacts) {
      addBrowse(ownerId, recordNode({ collection: 'artifacts', record_id: `artifacts:${source.id}` }, source.label), 'view_source_artifact');
    }
  }

  nodes.set(rootId, { id: rootId, type: 'campus', label: 'Ramapo College', role: 'navigation' });
  sourceNavigation(rootId, CAMPUS_GRAPH_SOURCES);
  for (const [kind, label] of Object.entries(KIND_LABELS)) {
    const id = identityCategoryId(kind);
    nodes.set(id, { id, type: 'category', category_kind: 'identity', identity_kind: kind, label, role: 'navigation' });
    addBrowse(rootId, id, 'browse_category');
    sourceNavigation(id, IDENTITY_TOPIC_SOURCES[kind as keyof typeof IDENTITY_TOPIC_SOURCES]);
  }
  for (const topic of CAMPUS_DATA_TOPICS) {
    const id = `category:topic:${topic.id}`;
    nodes.set(id, { id, type: 'category', category_kind: 'data', topic_id: topic.id, label: topic.label, description: topic.description, role: 'navigation' });
    addBrowse(rootId, id, 'browse_category');
    addBrowse(id, collectionNode(topic.collection, topic.label), 'browse_collection');
    sourceNavigation(id, topic.sources);
  }

  // Store each identity's metadata once. Its links and relationships are the
  // outgoing edges below; original array indexes retain ordering and repeats.
  index.identities.forEach((identity, identityIndex) => {
    const id = identityId(identity.id);
    nodes.set(id, {
      id, entity_id: identity.id, type: 'identity', name: identity.name,
      kind: identity.kind, aliases: [...identity.aliases],
      status: 'published', identity_index: identityIndex,
    });
    addBrowse(identityCategoryId(identity.kind), id, 'category_membership');
  });

  for (const identity of index.identities) {
    const from = identityId(identity.id);
    identity.links.forEach((link, linkIndex) => {
      const to = `record_selection:${encodeURIComponent(identity.id)}:${linkIndex}`;
      nodes.set(to, {
        id: to, type: 'record_selection', selection_kind: 'identity_source_link',
        selector: structuredClone(link), resolution: 'not_resolved',
      });
      edges.push({ id: `source_link:${encodeURIComponent(identity.id)}:${linkIndex}`, type: 'source_link', from, to, source_link_index: linkIndex });
      sourceLinkGroups++;
      sourceKeyEntries += link.source_record_keys.length;
      sourceIdEntries += link.source_record_ids?.length ?? 0;
    });
    identity.relationships.forEach((relationship, relationshipIndex) => {
      const edgeId = `relationship:${encodeURIComponent(identity.id)}:${relationshipIndex}`;
      const entityTarget = relationship.target_entity_id;
      const recordTarget = relationship.target_record;
      let to: string;
      let targetStatus: 'published_identity' | 'record_reference' | 'missing_identity' | 'invalid_target';
      const validIdentityTarget = typeof entityTarget === 'string' && entityTarget.trim().length > 0;
      if ((relationship.type === 'convener' || relationship.type === 'organized_by') && validIdentityTarget && !recordTarget) {
        to = identityId(entityTarget);
        targetStatus = identityIds.has(entityTarget) ? 'published_identity' : 'missing_identity';
        if (targetStatus === 'missing_identity' && !nodes.has(to)) {
          nodes.set(to, { id: to, type: 'identity', entity_id: entityTarget, status: 'missing', reason: 'Target is absent from the exported identity registry.' });
        }
      } else if (relationship.type === 'profile_course' && !entityTarget && validReference(recordTarget) && recordTarget.collection === 'courses') {
        to = recordNode({ ...recordTarget });
        targetStatus = 'record_reference';
      } else {
        to = `invalid_target:${encodeURIComponent(identity.id)}:${relationshipIndex}`;
        targetStatus = 'invalid_target';
        nodes.set(to, {
          id: to, type: 'record_reference', resolution: 'invalid',
          reason: 'Published relationship has no valid target matching its type; inspect the edge target fields.',
        });
      }
      // Keep original optional target fields and evidence exactly as published.
      // Only the relationship's type moves to relationship_type because type
      // identifies the export edge class.
      const { type: relationshipType, ...publishedFields } = structuredClone(relationship);
      edges.push({
        ...publishedFields, id: edgeId, type: 'evidence_relationship', from, to,
        relationship_type: relationshipType, relationship_index: relationshipIndex,
        target_status: targetStatus,
        ...(relationshipType === 'profile_course' ? { temporal_scope: 'undated_profile_list' } : {}),
      });
      if (targetStatus === 'missing_identity' || targetStatus === 'invalid_target') {
        diagnostics.push({ reason: targetStatus, edge_id: edgeId, target_node_id: to });
      }
      relationshipCount++;
      evidenceCount += relationship.evidence.length;
      relationshipCounts[relationship.type] = (relationshipCounts[relationship.type] ?? 0) + 1;
    });
  }

  return {
    schema: 'rockygpt.campus-relationship-graph', schema_version: 1,
    exported_at: exportedAt,
    snapshot: { dataset_version: index.dataset_version, identity_hash: index.identity_hash, campus_date: index.campus_date },
    completeness: {
      scope: 'entire_loaded_identity_registry',
      all_published_identities: true, all_published_identity_relationships: true,
      all_published_identity_source_link_groups: true,
      coverage_report: index.coverage === null ? 'not_available' : 'included_in_full',
      navigation_topics: 'included', source_record_bodies: 'not_embedded',
      raw_artifact_payloads: 'not_embedded', json_field_nodes: 'not_embedded',
      unlinked_individual_source_records: 'not_embedded', source_references_resolved_during_export: false,
    },
    semantics: {
      browse: 'Navigation and category membership only; these edges do not assert factual relationships.',
      source_link: 'A published identity link to an exact record selection. Match collection and source_key, a member of source_record_keys, and, when supplied, a member of source_record_ids. The arrays are independent constraints; never zip them.',
      availability_and_authority: 'Source links do not establish source authority or precedence, staff availability, or phone availability. Unknown hours or availability do not mean closed.',
      evidence_relationship: 'Directed from the owning identity to the published identity or record target. Evidence references and fields are retained; no relationship is inferred or reverse edge invented.',
      profile_course: 'An undated faculty-profile course list; it does not establish a current teaching assignment.',
      references: 'Record selectors are references, not embedded record bodies or proof that each reference resolves. Missing identity and invalid relationship targets are explicit.',
      identifiers: 'Persistent identity IDs are retained in entity_id. Other node and edge IDs are export identifiers and may change with another snapshot.',
      time: 'exported_at is download generation time, not source capture or verification time. The loaded snapshot may precede the currently active release.',
      coverage: 'Unresolved entries are reported issues, not unique missing records. Null coverage means a report was unavailable, not that every link was resolved.',
    },
    counts: {
      published_identities: index.identities.length,
      aliases: index.identities.reduce((sum, identity) => sum + identity.aliases.length, 0),
      source_link_groups: sourceLinkGroups, source_record_key_entries: sourceKeyEntries,
      source_record_id_entries: sourceIdEntries, evidence_relationships: relationshipCount,
      relationships_by_type: relationshipCounts, relationship_evidence_references: evidenceCount,
      unresolved_issues: index.coverage?.unresolved.length ?? null,
      missing_or_invalid_relationship_targets: diagnostics.length,
      nodes: nodes.size, edges: edges.length,
      browse_edges: edges.filter(edge => edge.type === 'browse').length,
    },
    nodes: [...nodes.values()], edges,
    navigation: structuredClone({ identity_topics: IDENTITY_TOPIC_SOURCES, data_topics: CAMPUS_DATA_TOPICS, campus_sources: CAMPUS_GRAPH_SOURCES }),
    coverage: structuredClone(index.coverage), diagnostics,
  };
}

export type CampusGraphExport = ReturnType<typeof buildCampusGraphExport>;
