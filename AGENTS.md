# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a single-page web application that provides an AI-powered product catalog assistant. Users can upload CSV files containing product and bundle data, then interact with Claude AI to query, analyze, and manage their catalog.

## Architecture

**Client-Side Single-Page App**
- Pure HTML/JavaScript/React application (no build system)
- All code is embedded in `index.html` as inline JSX using Babel standalone
- React components are loaded via CDN (React 18)
- Uses Tailwind CSS via CDN for styling
- PapaParse library (via CDN) handles CSV parsing

**Direct API Integration**
- The app currently makes direct API calls to Anthropic's API from the browser (index.html:142-156)
- API key is stored in browser localStorage
- There's a serverless function `netlify/functions/claude-proxy.js` that appears to be an alternative proxy implementation, but it's currently incomplete (truncated at line 40) and not actively used by the frontend

**Data Flow**
1. User uploads CSV files (products and/or bundles)
2. CSVs are parsed client-side using PapaParse into JSON arrays
3. When user asks a question, the app builds a context string containing:
   - All CSV data (or subset if >100 items)
   - Column metadata
   - User's question
4. Context is sent to Claude API with instructions for analysis
5. Claude's response is displayed in the chat interface

## Key Components

**App Component (index.html:19-364)**
The main React component manages:
- File uploads and CSV parsing
- API key management (localStorage)
- Chat message state and UI
- API communication with Anthropic

**Context Building Logic (index.html:108-140)**
Critical section that constructs the prompt sent to Claude. It:
- Includes sample data (first 5 rows) for preview
- For datasets ≤100 items: sends full data
- For datasets >100 items: sends first 50 products only
- Adds structured instructions for Claude on how to respond

## Development

**Running Locally**
Simply open `index.html` in a browser. No build process required.

**Netlify Deployment**
Configured via `netlify.toml` to deploy the static site. The build command is a no-op since there's no build step.

**Testing Changes**
Since this is vanilla HTML/JS, refresh the browser after editing `index.html`.

## Important Implementation Details

**API Key Security**
- API keys are stored in browser localStorage (index.html:39-44, 72-78)
- Currently, API calls go directly from browser to Anthropic (client-side)
- The `claude-proxy.js` serverless function exists but is incomplete and unused

**Model Configuration**
The app uses `claude-sonnet-4-20250514` (index.html:150). Update this line to use a different model.

**Data Handling**
- Large datasets (>100 items) are truncated to 50 items when sent to Claude (index.html:121)
- This prevents token limit issues but means Claude won't see all products in large catalogs
- Consider implementing pagination or search-based filtering for large catalogs

**Message Structure**
Each API request is stateless - only the current question with embedded data context is sent. Previous conversation history is not included in API calls (only maintained in local UI state).

## Common Modifications

**Adjusting Data Limits**
Change the threshold at index.html:117 and index.html:130 to modify how many products are sent to Claude.

**Changing Model**
Update the model name at index.html:150.

**Implementing the Proxy**
To use the serverless function instead of direct API calls:
1. Complete the `claude-proxy.js` implementation (currently truncated)
2. Update fetch URL at index.html:142 to use `/.netlify/functions/claude-proxy`
3. Modify the request body structure to match the proxy's expected format
