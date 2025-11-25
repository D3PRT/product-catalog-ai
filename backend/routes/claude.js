const express = require('express');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');
const { claudeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Claude API completion endpoint
router.post('/completion', authenticate, claudeLimiter, async (req, res) => {
  try {
    const { messages, max_tokens = 4096, system, temperature = 1, thinking } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    await logAction(req.user.id, 'CLAUDE_API_CALL', 'ai', null, {
      messageCount: messages.length,
      maxTokens: max_tokens,
      hasSystem: !!system,
    });

    const requestBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages,
    };

    if (system) {
      requestBody.system = system;
    }

    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }

    if (thinking) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: thinking.budget_tokens || 4000,
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API error:', errorData);
      
      await logAction(req.user.id, 'CLAUDE_API_ERROR', 'ai', null, {
        status: response.status,
        error: errorData,
      });

      return res.status(response.status).json({
        error: errorData.error?.message || 'Claude API request failed',
        details: errorData,
      });
    }

    const data = await response.json();

    await logAction(req.user.id, 'CLAUDE_API_SUCCESS', 'ai', data.id, {
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      stopReason: data.stop_reason,
    });

    res.json({
      success: true,
      data,
    });

  } catch (error) {
    console.error('Claude API proxy error:', error);
    
    await logAction(req.user.id, 'CLAUDE_API_ERROR', 'ai', null, {
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to process AI request',
      message: error.message,
    });
  }
});

// Analyze data endpoint
router.post('/analyze', authenticate, claudeLimiter, async (req, res) => {
  try {
    const { data, type, analysisType = 'general', options = {} } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Data array required' });
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (analysisType === 'sanity-check') {
      systemPrompt = 'You are a data quality expert. Analyze the provided data and identify issues, inconsistencies, and suggestions for improvement.';
      userPrompt = `Analyze this ${type} data and provide a comprehensive quality assessment:\n\n${JSON.stringify(data.slice(0, 50), null, 2)}`;
    } else if (analysisType === 'wizard') {
      systemPrompt = 'You are a business intelligence analyst. Provide insights, patterns, trends, and actionable recommendations.';
      userPrompt = `Analyze this ${type} data and provide comprehensive insights:\n\n${JSON.stringify(data.slice(0, 20), null, 2)}`;
    } else {
      systemPrompt = 'You are a helpful data analyst.';
      userPrompt = `Analyze this data:\n\n${JSON.stringify(data.slice(0, 50), null, 2)}`;
    }

    await logAction(req.user.id, 'DATA_ANALYSIS', type, null, {
      analysisType,
      dataRows: data.length,
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 4096,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
        thinking: options.thinking ? {
          type: 'enabled',
          budget_tokens: 4000,
        } : undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'Analysis failed',
        details: errorData,
      });
    }

    const result = await response.json();

    await logAction(req.user.id, 'DATA_ANALYSIS_SUCCESS', type, result.id, {
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    });

    res.json({
      success: true,
      analysis: result.content[0].text,
      usage: result.usage,
    });

  } catch (error) {
    console.error('Data analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'claude-api-proxy',
  });
});

module.exports = router;
