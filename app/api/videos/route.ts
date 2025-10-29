import { NextResponse } from 'next/server';

const apiServer = process.env.API_SERVER;

export async function GET() {
  if (!apiServer) {
    return NextResponse.json(
      { error: 'API_SERVER environment variable is not configured.' },
      { status: 500 }
    );
  }

  const endpoint = `${apiServer.replace(/\/$/, '')}/publication?limit=50`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Upstream responded with ${response.status}: ${message || 'Unknown error'}`);
    }

    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load publications:', error);
    return NextResponse.json(
      { error: 'Unable to load publications.' },
      { status: 502 }
    );
  }
}
