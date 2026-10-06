/** A graph link keeps the publication and inspection time of its originating trace. */
export function campusGraphHref(
  nodeId: string,
  datasetVersion: string,
  identityHash: string,
  asOf?: string,
  fields?: string[],
): string {
  const params = new URLSearchParams({
    node_id: nodeId,
    dataset_version: datasetVersion,
    identity_hash: identityHash,
  });
  if (asOf) params.set('as_of', asOf);
  if (fields?.length) params.set('fields', fields.join(','));
  return `/data/entities?${params}`;
}
