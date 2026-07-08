import { NextRequest, NextResponse } from 'next/server';
import { readSheet, writeSheet, appendSheet, deleteSheetRow } from "@/lib/google-sheets";
import { auth } from "@/lib/auth-options";

export const dynamic = 'force-dynamic';

const sheetId = process.env.SHEET_ID_HIDDEN_MISSION || '1aPrtF590zZu7fQYrCZSzZZSDs8zRkqfr7Oqzn-9PyzY';

function cleanNum(val: any): number {
  if (!val) return 0;
  const str = String(val).replace(/[$,]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export async function GET() {
  try {
    const [scoreboardRes, trackerRes, rewardRes, leadgeARes, leadgeBRes, leadgeCRes] = await Promise.allSettled([
      readSheet(sheetId, 'Scoreboard!A:K'),
      readSheet(sheetId, 'Tracker!A:F'),
      readSheet(sheetId, 'Reward!A:D'),
      readSheet(sheetId, 'LeadgeA!A:W'),
      readSheet(sheetId, 'LeadgeB!A:D'),
      readSheet(sheetId, 'LeadgeC!A:J'),
    ]);

    const scoreboardRows = scoreboardRes.status === 'fulfilled' ? scoreboardRes.value : [];
    const trackerRows = trackerRes.status === 'fulfilled' ? trackerRes.value : [];
    const rewardRows = rewardRes.status === 'fulfilled' ? rewardRes.value : [];
    const leadgeARows = leadgeARes.status === 'fulfilled' ? leadgeARes.value : [];
    const leadgeBRows = leadgeBRes.status === 'fulfilled' ? leadgeBRes.value : [];
    const leadgeCRows = leadgeCRes.status === 'fulfilled' ? leadgeCRes.value : [];

    // Parse Scoreboard (Rows 3+, index 2+)
    const scoreboard = [];
    for (let i = 2; i < scoreboardRows.length; i++) {
      const row = scoreboardRows[i];
      const hunter = row[0]?.trim();
      if (hunter && hunter !== 'Total' && hunter !== '加總') {
        scoreboard.push({
          hunter,
          challengeA: {
            total: cleanNum(row[1]),
            claimed: cleanNum(row[2]),
            balance: cleanNum(row[3]),
          },
          challengeB: {
            total: cleanNum(row[4]),
            claimed: cleanNum(row[5]),
            balance: cleanNum(row[6]),
          },
          challengeC: {
            total: cleanNum(row[7]),
            claimed: cleanNum(row[8]),
            balance: cleanNum(row[9]),
          },
          totalReward: cleanNum(row[10]),
        });
      }
    }
    scoreboard.sort((a, b) => (b.totalReward || 0) - (a.totalReward || 0));

    // Parse Tracker (Rows 2+, index 1+)
    const tracker = [];
    for (let i = 1; i < trackerRows.length; i++) {
      const row = trackerRows[i];
      if (row.length > 0 && row.some(c => c && String(c).trim() !== '')) {
        tracker.push({
          rowIndex: i + 1,
          date: row[0]?.trim() || '',
          hunter: row[1]?.trim() || '',
          target: row[2]?.trim() || '',
          shares: row[3]?.trim() || '',
          amount: row[4]?.trim() || '',
          type: row[5]?.trim() || '',
        });
      }
    }

    // Parse Reward (Rows 2+, index 1+)
    const reward = [];
    for (let i = 1; i < rewardRows.length; i++) {
      const row = rewardRows[i];
      if (row.length > 0 && row.some(c => c && String(c).trim() !== '')) {
        reward.push({
          rowIndex: i + 1,
          date: row[0]?.trim() || '',
          hunter: row[1]?.trim() || '',
          amount: row[2]?.trim() || '',
          category: row[3]?.trim() || '',
        });
      }
    }

    // Parse LeadgeA (Rows 3+, index 2+)
    const leadgeA = [];
    for (let i = 2; i < leadgeARows.length; i++) {
      const row = leadgeARows[i];
      const hunter = row[0]?.trim();
      if (hunter) {
        leadgeA.push({
          hunter,
          buyDate: row[1]?.trim() || '',
          target: row[2]?.trim() || '',
          shares: row[3]?.trim() || '',
          amount: row[4]?.trim() || '',
          accumulatedShares: row[5]?.trim() || '',
          days90: row[6]?.trim() || '',
          days180: row[7]?.trim() || '',
          days270: row[8]?.trim() || '',
          days360: row[9]?.trim() || '',
          q1Reward: row[19]?.trim() || '',
          q2Reward: row[20]?.trim() || '',
          q3Reward: row[21]?.trim() || '',
          q4Reward: row[22]?.trim() || '',
        });
      }
    }

    // Parse LeadgeB (Rows 5+, index 4+)
    const leadgeB = [];
    for (let i = 4; i < leadgeBRows.length; i++) {
      const row = leadgeBRows[i];
      const hunter = row[0]?.trim();
      if (hunter) {
        leadgeB.push({
          hunter,
          consecutiveMonths: cleanNum(row[1]),
          accumulatedAmount: row[2]?.trim() || '',
          reward: row[3]?.trim() || '',
        });
      }
    }

    // Parse LeadgeC (Rows 3+, index 2+)
    const leadgeC = [];
    for (let i = 2; i < leadgeCRows.length; i++) {
      const row = leadgeCRows[i];
      const hunter = row[1]?.trim();
      if (hunter) {
        leadgeC.push({
          date: row[0]?.trim() || '',
          hunter,
          pnlA: row[2]?.trim() || '',
          costB: row[3]?.trim() || '',
          realizedPnlC: row[4]?.trim() || '',
          withdrawnD: row[5]?.trim() || '',
          dividendE: row[6]?.trim() || '',
          returnRate: row[7]?.trim() || '',
          totalPool: row[8]?.trim() || '',
          rankReward: row[9]?.trim() || '',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        scoreboard,
        tracker,
        reward,
        leadgeA,
        leadgeB,
        leadgeC,
      }
    });
  } catch (error) {
    console.error('[Sheets GET] hidden-mission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch hidden mission data' },
      { status: 500 }
    );
  }
}

async function checkEditPermission() {
  const session = await auth();
  if (!session?.user && process.env.NODE_ENV !== 'development') {
    return { allowed: false, status: 401, error: 'Unauthorized' };
  }
  if (session?.user) {
    const roles = (session.user as any).roles || {};
    const userRole = roles['hidden'] || 'viewer';
    if (userRole !== 'editor' && userRole !== 'admin' && process.env.NODE_ENV !== 'development') {
      return { allowed: false, status: 403, error: 'Forbidden: You do not have edit permissions for hidden mission.' };
    }
  }
  return { allowed: true };
}

export async function POST(req: NextRequest) {
  try {
    const perm = await checkEditPermission();
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const { action, tab, values } = body as { action: string; tab: string; values: string[][] };

    if (action !== 'append' || !tab || !values || !Array.isArray(values)) {
      return NextResponse.json({ error: 'Invalid payload for append' }, { status: 400 });
    }

    if (tab !== 'Tracker' && tab !== 'Reward') {
      return NextResponse.json({ error: 'Only Tracker and Reward sheets can be edited' }, { status: 400 });
    }

    await appendSheet(sheetId, `${tab}!A:Z`, values);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[Sheets POST] hidden-mission:', err);
    return NextResponse.json({ error: 'Failed to append record' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const perm = await checkEditPermission();
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const { action, tab, rowIndex, values } = body as { action: string; tab: string; rowIndex: number; values: string[][] };

    if (action !== 'update' || !tab || !rowIndex || !values || !Array.isArray(values)) {
      return NextResponse.json({ error: 'Invalid payload for update' }, { status: 400 });
    }

    if (tab !== 'Tracker' && tab !== 'Reward') {
      return NextResponse.json({ error: 'Only Tracker and Reward sheets can be edited' }, { status: 400 });
    }

    const colEnd = tab === 'Tracker' ? 'F' : 'D';
    const range = `${tab}!A${rowIndex}:${colEnd}${rowIndex}`;
    await writeSheet(sheetId, range, values);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[Sheets PATCH] hidden-mission:', err);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const perm = await checkEditPermission();
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const { action, tab, rowIndex } = body as { action: string; tab: string; rowIndex: number };

    if (action !== 'delete' || !tab || !rowIndex) {
      return NextResponse.json({ error: 'Invalid payload for delete' }, { status: 400 });
    }

    if (tab !== 'Tracker' && tab !== 'Reward') {
      return NextResponse.json({ error: 'Only Tracker and Reward sheets can be edited' }, { status: 400 });
    }

    await deleteSheetRow(sheetId, tab, rowIndex);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[Sheets DELETE] hidden-mission:', err);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}
