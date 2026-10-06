import { JsonViewer } from '@/components/JsonViewer';
import type { DevTool } from '@/lib/brain-dev-types';

type Schema = Record<string, unknown>;

interface Row {
  name: string;
  required: boolean;
  kind: string;
  limits: string | null;
  nullable: boolean;
  choices: string[];
  itemRows: Row[];
}

function isSchema(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolve(node: unknown, root: Schema): Schema | null {
  if (!isSchema(node)) return null;
  const ref = node.$ref;
  if (ref === undefined) return node;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/') || !isSchema(root.$defs)) return null;
  return resolve(root.$defs[ref.slice('#/$defs/'.length)], root);
}

function range(min: unknown, max: unknown, unit: string): string | null {
  const low = typeof min === 'number' ? min : null;
  const high = typeof max === 'number' ? max : null;
  if (low !== null && high !== null) return `${low} to ${high}${unit}`;
  if (high !== null) return `up to ${high}${unit}`;
  if (low !== null) return `at least ${low}${unit}`;
  return null;
}

function readRows(schema: Schema, root: Schema): Row[] | null {
  if (!isSchema(schema.properties)) return null;
  const required = Array.isArray(schema.required) ? schema.required : [];
  const rows: Row[] = [];
  for (const [name, raw] of Object.entries(schema.properties)) {
    const row = readRow(name, raw, required.includes(name), root);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function readRow(name: string, raw: unknown, required: boolean, root: Schema): Row | null {
  let node = resolve(raw, root);
  if (!node) return null;
  let nullable = false;
  if (Array.isArray(node.anyOf)) {
    const variants = node.anyOf.map((variant) => resolve(variant, root));
    if (variants.some((variant) => variant === null)) return null;
    const present = (variants as Schema[]).filter((variant) => variant.type !== 'null');
    nullable = present.length < variants.length;
    if (present.length !== 1) return null;
    node = present[0];
  }
  if (typeof node.type !== 'string') return null;

  let kind = node.type === 'string' ? 'text' : node.type === 'integer' ? 'whole number' : node.type;
  let limits: string | null = null;
  let choices: string[] = [];
  let itemRows: Row[] = [];

  if (node.type === 'string') {
    limits = range(node.minLength, node.maxLength, ' characters');
    if (Array.isArray(node.enum) && node.enum.every((value) => typeof value === 'string')) {
      kind = 'one of';
      choices = node.enum as string[];
    }
  } else if (node.type === 'integer') {
    limits = range(node.minimum, node.maximum, '');
  } else if (node.type === 'array') {
    limits = range(node.minItems, node.maxItems, node.maxItems === 1 ? ' item' : ' items');
    const items = resolve(node.items, root);
    if (!items) return null;
    if (Array.isArray(items.enum) && items.enum.every((value) => typeof value === 'string')) {
      kind = 'list of choices';
      choices = items.enum as string[];
    } else if (items.type === 'object') {
      const nested = readRows(items, root);
      if (!nested) return null;
      kind = 'list of objects';
      itemRows = nested;
    } else {
      return null;
    }
  } else {
    return null;
  }

  return { name, required, kind, limits, nullable, choices, itemRows };
}

function readTool(tool: DevTool): Row[] | null {
  return readRows(tool.parameters, tool.parameters);
}

export function ToolsView({ tools }: { tools: DevTool[] }) {
  return (
    <div className="space-y-4">
      {tools.map((tool) => {
        const rows = readTool(tool);
        return (
          <section key={tool.name} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="font-mono text-sm font-semibold text-foreground">{tool.name}</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{tool.description}</p>
            {rows ? (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  What the model sends
                </p>
                <RowList rows={rows} />
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <JsonViewer data={tool.parameters} title={`${tool.name} request schema`} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.name} className="text-xs">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-sm text-foreground">{row.name}</span>
            <span className="text-muted-foreground">{row.kind}</span>
            {row.limits && <span className="font-mono text-foreground/80">{row.limits}</span>}
            <span className="text-muted-foreground/70">
              {row.required ? 'always sent' : 'optional'}
              {row.nullable ? ', may be null' : ''}
            </span>
          </div>
          {row.choices.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {row.choices.map((choice) => (
                <span
                  key={choice}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-foreground/80"
                >
                  {choice}
                </span>
              ))}
            </div>
          )}
          {row.itemRows.length > 0 && (
            <div className="mt-2 border-l border-white/10 pl-4">
              <p className="mb-2 text-muted-foreground">Each one has</p>
              <RowList rows={row.itemRows} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
