import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';

export const POST = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const {
      name,
      description,
      objective,
      campaignType,
      budgetTotal,
      budgetDaily,
      startDate,
      endDate,
      targetAudience,
      platforms,
      kpiGoals
    } = body;

    if (!name || !objective || !campaignType) {
      return NextResponse.json(
        { error: 'Name, objective, and campaign type are required' },
        { status: 400 }
      );
    }

    const query = `
      INSERT INTO campaigns (
        user_id, team_id, name, description, objective, campaign_type,
        budget_total, budget_daily, start_date, end_date, target_audience,
        platforms, kpi_goals, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await db.query(query, [
      user.userId,
      user.teamId,
      name,
      description,
      objective,
      campaignType,
      budgetTotal,
      budgetDaily,
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null,
      JSON.stringify(targetAudience || {}),
      platforms || [],
      JSON.stringify(kpiGoals || {}),
      user.userId
    ]);

    return NextResponse.json({
      success: true,
      campaign: result.rows[0]
    });

  } catch (error) {
    console.error('Campaign creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
});

export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = `
      SELECT c.*, 
             COUNT(p.id) as post_count,
             SUM(CASE WHEN p.status = 'posted' THEN 1 ELSE 0 END) as posted_count,
             SUM(CASE WHEN p.status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_count
      FROM campaigns c
      LEFT JOIN posts p ON c.id = p.campaign_id
      WHERE c.user_id = $1
    `;
    
    const values = [user.userId];

    if (status) {
      query += ` AND c.status = $${values.length + 1}`;
      values.push(status);
    }

    query += `
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    
    values.push(limit, offset);

    const result = await db.query(query, values);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM campaigns WHERE user_id = $1';
    const countValues = [user.userId];
    
    if (status) {
      countQuery += ' AND status = $2';
      countValues.push(status);
    }

    const countResult = await db.query(countQuery, countValues);

    return NextResponse.json({
      success: true,
      campaigns: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
        hasMore: parseInt(countResult.rows[0].count) > offset + limit
      }
    });

  } catch (error) {
    console.error('Campaigns fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
});