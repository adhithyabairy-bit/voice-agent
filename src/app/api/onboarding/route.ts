import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, createScopedClient } from '@/lib/db/supabase';
import { getAuthSession } from '@/lib/auth/session';
import { chunkText, generateEmbedding } from '@/lib/ai/knowledge';
import { invalidateBusinessCache } from '@/lib/services/business';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getAuthSession(req);
    let userId = session?.userId;

    // Fallback: If token header was missing on mobile browser, look up registered user by email
    if (!userId && body.email) {
      try {
        const cleanEmail = body.email.trim().toLowerCase();
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const matched = listData?.users?.find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );
        if (matched) {
          userId = matched.id;
        }
      } catch (lookupErr) {
        console.warn('Fallback user lookup by email failed:', lookupErr);
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in to create a business.' }, { status: 401 });
    }

    // Scoped client with user JWT token if present, otherwise supabaseAdmin
    const db = createScopedClient(session?.token);

    const {
      business_name,
      business_type = 'service',
      description = '',
      phone = '',
      email = '',
      address = '',
      working_hours = {
        monday: '9:00 AM - 7:00 PM',
        tuesday: '9:00 AM - 7:00 PM',
        wednesday: '9:00 AM - 7:00 PM',
        thursday: '9:00 AM - 7:00 PM',
        friday: '9:00 AM - 7:00 PM',
        saturday: '10:00 AM - 5:00 PM',
        sunday: 'Closed',
      },
      agent_name = 'Aditya',
      language = 'te-IN',
      voice = 'aditya',
      response_style = 'friendly',
      greeting,
      services = [],
      faqs = [],
      knowledge_docs = [],
    } = body;

    if (!business_name?.trim()) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }

    // 1. Create Business
    const businessPayload = {
      owner_id: userId,
      business_name: business_name.trim(),
      business_type,
      description: description.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      address: address.trim(),
      working_hours,
    };

    let { data: business, error: businessError } = await db
      .from('businesses')
      .insert(businessPayload)
      .select()
      .single();

    if (businessError && db !== supabaseAdmin) {
      const retry = await supabaseAdmin
        .from('businesses')
        .insert(businessPayload)
        .select()
        .single();
      business = retry.data;
      businessError = retry.error;
    }

    if (businessError || !business) {
      console.error('Error creating business:', businessError);
      return NextResponse.json({ error: businessError?.message || 'Failed to create business' }, { status: 500 });
    }

    const businessId = business.id;

    // Default dynamic greeting if none provided
    const defaultGreeting = greeting?.trim() || (
      language === 'te-IN'
        ? `నమస్కారం! ${business_name}కి స్వాగతం. నేను మీకు ఎలా సహాయపడగలను?`
        : language === 'hi-IN'
        ? `नमस्ते! ${business_name} में आपका स्वागत है। मैं आपकी क्या मदद कर सकता हूँ?`
        : `Hello! Welcome to ${business_name}. How can I assist you today?`
    );

    // 2. Create Agent
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('agents')
      .insert({
        business_id: businessId,
        agent_name: agent_name.trim() || 'AI Assistant',
        language,
        voice,
        response_style,
        greeting: defaultGreeting,
        fallback_message: language === 'te-IN'
          ? 'క్షమించండి, మీ మాట సరిగా వినపడలేదు. మళ్లీ చెప్పగలరా?'
          : language === 'hi-IN'
          ? 'क्षमा करें, मुझे आपकी आवाज़ साफ़ नहीं आई। क्या आप दोहरा सकते हैं?'
          : "I'm sorry, I didn't quite catch that. Could you please repeat?",
        is_active: true,
      })
      .select()
      .single();

    if (agentError) {
      console.error('Error creating agent:', agentError);
    }

    // 3. Insert Services
    if (Array.isArray(services) && services.length > 0) {
      const servicesToInsert = services
        .filter((s: any) => s.name?.trim())
        .map((s: any) => ({
          business_id: businessId,
          name: s.name.trim(),
          description: s.description?.trim() || null,
          price: s.price !== undefined && s.price !== null ? Number(s.price) : null,
          currency: s.currency || 'INR',
          duration_minutes: s.duration_minutes ? Number(s.duration_minutes) : null,
        }));

      if (servicesToInsert.length > 0) {
        const { error: sError } = await supabaseAdmin.from('services').insert(servicesToInsert);
        if (sError) console.error('Error inserting services:', sError);
      }
    }

    // 4. Insert FAQs
    if (Array.isArray(faqs) && faqs.length > 0) {
      const faqsToInsert = faqs
        .filter((f: any) => f.question?.trim() && f.answer?.trim())
        .map((f: any) => ({
          business_id: businessId,
          question: f.question.trim(),
          answer: f.answer.trim(),
        }));

      if (faqsToInsert.length > 0) {
        const { error: fError } = await supabaseAdmin.from('faqs').insert(faqsToInsert);
        if (fError) console.error('Error inserting faqs:', fError);

        // Also add FAQs to knowledge base chunks
        for (const faq of faqsToInsert) {
          const faqText = `FAQ - Question: ${faq.question}\nAnswer: ${faq.answer}`;
          const embedding = generateEmbedding(faqText);
          await supabaseAdmin.from('knowledge_chunks').insert({
            business_id: businessId,
            content: faqText,
            embedding,
            metadata: { type: 'faq', question: faq.question },
          });
        }
      }
    }

    // 5. Insert Knowledge Documents if any
    if (Array.isArray(knowledge_docs) && knowledge_docs.length > 0) {
      for (const doc of knowledge_docs) {
        if (!doc.title?.trim() || !doc.content?.trim()) continue;

        const { data: docData } = await supabaseAdmin
          .from('knowledge_documents')
          .insert({
            business_id: businessId,
            title: doc.title.trim(),
            content: doc.content.trim(),
            source_type: 'text',
          })
          .select('id')
          .single();

        const docId = docData?.id;
        const chunks = chunkText(doc.content.trim(), 400, 50);

        for (const chunk of chunks) {
          const embedding = generateEmbedding(chunk);
          await supabaseAdmin.from('knowledge_chunks').insert({
            business_id: businessId,
            document_id: docId || null,
            content: chunk,
            embedding,
            metadata: { doc_title: doc.title.trim() },
          });
        }
      }
    }

    // Clear business cache so fresh data is retrieved
    invalidateBusinessCache(businessId);
    invalidateBusinessCache(userId || undefined);

    return NextResponse.json({
      success: true,
      businessId,
      agentId: agent?.id,
      message: 'Business and AI Voice Agent configured successfully!',
    });
  } catch (error: any) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
