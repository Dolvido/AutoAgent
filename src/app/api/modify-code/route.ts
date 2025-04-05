import { NextRequest, NextResponse } from 'next/server';
import { modifyCode, mockModifyCode } from '@/lib/llm/code-modifier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language, issue, options = {} } = body;

    // Validate required fields
    if (!code || !language || !issue || !issue.id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Try to use the real LLM implementation first
    try {
      const result = await modifyCode(code, language, issue, options);
      return NextResponse.json(result);
    } catch (error) {
      console.error("Error with main code modification, falling back to mock:", error);
      
      // If LLM fails, fall back to mock implementation
      const mockResult = await mockModifyCode(code, language, issue);
      return NextResponse.json({
        ...mockResult,
        status: 'warning',
        errorMessage: 'Used fallback implementation due to LLM error'
      });
    }
  } catch (error: any) {
    console.error("API error in modify-code route:", error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
} 