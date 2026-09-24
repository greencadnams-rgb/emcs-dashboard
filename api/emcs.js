// api/emcs.js
import { NextResponse } from 'next/server'; // Or however you import fetch/response in your setup

export async function POST(req) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint');
  
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint param' }, { status: 400 });
  }

  // Get auth token from headers
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the raw body as text first to preserve exact formatting
  const bodyText = await req.text(); 
  
  // Determine content type from incoming request
  const contentType = req.headers.get('content-type') || 'application/xml';

  try {
    const response = await fetch(`https://test-api.service.hmrc.gov.uk${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': contentType, // Forward the original Content-Type
        'Accept': 'application/json', // Usually expect JSON back for validation errors
        'User-Agent': 'EMCS-Dashboard/1.0'
      },
      body: bodyText // Send the EXACT string received
    });

    const responseBody = await response.text();
    
    return new Response(responseBody, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'text/plain',
      }
    });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Handle GET requests similarly if needed
export async function GET(req) {
   const url = new URL(req.url);
   const endpoint = url.searchParams.get('endpoint');
   const authHeader = req.headers.get('authorization');
   
   if (!endpoint || !authHeader) return NextResponse.json({ error: 'Bad Request' }, { status: 400 });

   const response = await fetch(`https://test-api.service.hmrc.gov.uk${endpoint}`, {
     method: 'GET',
     headers: {
       'Authorization': authHeader,
       'Accept': 'application/json'
     }
   });

   return new Response(await response.text(), {
     status: response.status,
     headers: { 'Content-Type': response.headers.get('content-type') }
   });
}
