# Campus Graph JSON export

Use **Download graph** at the top of the Campus Graph page. The JSON includes the
entire loaded identity release, independently of the current search, selected
identity, date filter, expanded neighborhood, or pagination. Downloading does not
send the file to another service or call a model.

The portable file contains graph nodes and directed edges, identity names and
aliases, published relationships and their original evidence, exact source-record
selectors, navigation categories, and the full unresolved-coverage report. Dataset
version, identity artifact hash, campus date, and export timestamp identify the
snapshot. Export time is never a source verification time.

Navigation edges are distinct from factual relationships. A category does not
prove an affiliation, and a linked operating-hours record does not establish staff
or telephone availability. Faculty profile course relationships remain undated.
Missing relationship targets are explicit; the exporter does not guess links.

Source-link record-key and record-ID arrays remain intact as selection sets. They
must not be zipped together: some original links have multiple keys and IDs with
different lengths. This preserves the actual matching rules, including repeated
event keys with specific occurrence IDs.

This is a **relationship export**. Complete source-record bodies, menus, document
text, and raw release-artifact payloads are referenced rather than embedded. Those
contents remain available under View source in the Dev UI. The file's completeness
metadata states that boundary so another AI can distinguish an absent fact from a
missing connection. It is suitable for inspecting connectivity, provenance paths,
coverage gaps, and relationship consistency, without interpreting navigation links
as new campus facts.

Verified against the running Dev UI on September 21, 2026: the button downloaded
a valid JSON file while a single menu item's nested fields were open. The saved
file still contained all 905 identities, 165 relationships, 1,134 source-link
groups, 463 aliases, and 1,053 unresolved issues. All 2,258 edges resolve to the
2,138 exported nodes; there were no missing or invalid relationship targets.
Formatted file size was approximately 1.85 MB. All 42 helper tests, lint,
TypeScript, and an isolated production build passed. Tests include exact evidence,
repeated links, missing targets, complete counts, and deterministic snapshots.

To roll back the download feature, revert its Dev UI commit on `dev` and push
normally; the prior UI checkpoint is `d7df15d`. No Brain deployment or data
publication is involved.
