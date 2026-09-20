import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/db/supabase';

export async function POST(req: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Database is not configured.' },
        { status: 500 }
      );
    }

    const { email, password, fullName } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Try to create the user directly with email_confirm: true
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || '',
      },
    });

    if (!createError && newUser?.user) {
      return NextResponse.json({
        success: true,
        user: newUser.user,
        message: 'Account created successfully.',
      });
    }

    // 2. If user already exists, check if unconfirmed or needs password update
    if (createError && createError.message?.toLowerCase().includes('already registered')) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );

      if (existing) {
        // Auto-confirm the existing user and update password so they can proceed immediately
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          email_confirm: true,
          password,
          user_metadata: {
            full_name: fullName || existing.user_metadata?.full_name || '',
          },
        });

        return NextResponse.json({
          success: true,
          user: existing,
          message: 'Account verified and ready.',
        });
      }

      return NextResponse.json(
        { error: 'An account with this email is already registered. Please sign in.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: createError?.message || 'Failed to create account.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Sign up API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
