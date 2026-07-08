import { describe, it, expect } from 'vitest';
import { parseInboundPayload } from '@/lib/whatsappProvider';

describe('parseInboundPayload', () => {
  it('parses a typical 360dialog text message payload', () => {
    const body = {
      contacts: [{ profile: { name: 'Ana' }, wa_id: '34612345678' }],
      messages: [
        {
          id: 'wamid.ABC123',
          from: '34612345678',
          timestamp: '1719830000',
          type: 'text',
          text: { body: 'Quiero una cita de cardiología' },
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({
      messages: [
        {
          id: 'wamid.ABC123',
          from: '34612345678',
          type: 'text',
          text: 'Quiero una cita de cardiología',
        },
      ],
    });
  });

  it('returns empty messages for empty/nullish payloads', () => {
    expect(parseInboundPayload({})).toEqual({ messages: [] });
    expect(parseInboundPayload(null)).toEqual({ messages: [] });
    expect(parseInboundPayload(undefined)).toEqual({ messages: [] });
  });

  it('returns empty messages when messages is missing or empty', () => {
    expect(parseInboundPayload({ contacts: [] })).toEqual({ messages: [] });
    expect(parseInboundPayload({ messages: [] })).toEqual({ messages: [] });
    expect(parseInboundPayload({ messages: 'not-an-array' })).toEqual({ messages: [] });
  });

  it('normalises non-text messages with text: null', () => {
    const body = {
      messages: [
        {
          id: 'wamid.IMG1',
          from: '34600000000',
          type: 'image',
          image: { id: 'media-1', mime_type: 'image/jpeg' },
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({
      messages: [
        { id: 'wamid.IMG1', from: '34600000000', type: 'image', text: null },
      ],
    });
  });

  it('defaults missing fields to null', () => {
    expect(parseInboundPayload({ messages: [{}] })).toEqual({
      messages: [{ id: null, from: null, type: null, text: null }],
    });
    // text message without a body
    expect(parseInboundPayload({ messages: [{ id: 'x', from: 'y', type: 'text' }] })).toEqual({
      messages: [{ id: 'x', from: 'y', type: 'text', text: null }],
    });
  });
});
