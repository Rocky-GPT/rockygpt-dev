import { NextRequest, NextResponse } from 'next/server';
import { brainAddress } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { url } = brainAddress();
  if (!url) {
    return NextResponse.json({ error: 'Brain URL is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const requestedCapability = searchParams.get('capability');

  try {
    // If a specific capability is requested
    if (requestedCapability && requestedCapability !== 'all') {
      const res = await fetch(
        `${url}/v1/capabilities/${encodeURIComponent(requestedCapability)}/records`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch records for ${requestedCapability}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Otherwise export all capabilities in parallel
    const capRes = await fetch(`${url}/v1/capabilities`, { cache: 'no-store' });
    if (!capRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch capabilities list' },
        { status: capRes.status }
      );
    }
    const capData = await capRes.json();
    const capabilities: Array<{ capability: string; describes: string }> =
      capData.capabilities || [];

    const recordPromises = capabilities.map(async (cap) => {
      try {
        const rRes = await fetch(
          `${url}/v1/capabilities/${encodeURIComponent(cap.capability)}/records`,
          { cache: 'no-store' }
        );
        if (!rRes.ok) {
          return {
            capability: cap.capability,
            records: [],
            describes: cap.describes,
            error: `HTTP ${rRes.status}`,
          };
        }
        const rData = await rRes.json();
        return {
          capability: cap.capability,
          records: rData.records || [],
          describes: cap.describes,
        };
      } catch (err) {
        return {
          capability: cap.capability,
          records: [],
          describes: cap.describes,
          error: String(err),
        };
      }
    });

    const results = await Promise.all(recordPromises);

    const summary: Record<string, number> = {};
    const capabilitiesMap: Record<
      string,
      { count: number; description: string; records: Record<string, unknown>[] }
    > = {};
    let totalRecords = 0;

    for (const r of results) {
      summary[r.capability] = r.records.length;
      totalRecords += r.records.length;
      capabilitiesMap[r.capability] = {
        count: r.records.length,
        description: r.describes,
        records: r.records,
      };
    }

    const payload = {
      metadata: {
        dataset: 'RockyGPT Campus Records Data Warehouse',
        exported_at: new Date().toISOString(),
        total_capabilities: results.length,
        total_records: totalRecords,
        summary,
        chatgpt_prompt_suggestion:
          'Please act as an expert data scientist and perform a comprehensive data quality and exploratory analysis on this dataset. Identify: 1) Missing values and nullity distribution, 2) Schema irregularities and inconsistent data types, 3) Outliers and anomalies in numeric or text fields, 4) Temporal consistency (dates, operating hours, expired events), and 5) Top prioritized data-cleaning recommendations.',
      },
      capabilities: capabilitiesMap,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error during export' },
      { status: 500 }
    );
  }
}
