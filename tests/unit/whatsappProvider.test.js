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

  // 360dialog v2 accounts (Meta embedded signup, waba-v2) forward the raw
  // Cloud API envelope — messages live in entry[].changes[].value.messages.
  // This is the shape our production account actually sends; the top-level
  // `messages` shape above is the legacy v1 format.
  it('parses the Cloud API (v2) envelope with nested messages', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '174390087679667',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15554262389', phone_number_id: '999' },
                contacts: [{ profile: { name: 'Ana' }, wa_id: '34612345678' }],
                messages: [
                  {
                    id: 'wamid.V2MSG',
                    from: '34612345678',
                    timestamp: '1719830000',
                    type: 'text',
                    text: { body: 'Hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({
      messages: [
        { id: 'wamid.V2MSG', from: '34612345678', type: 'text', text: 'Hola' },
      ],
    });
  });

  it('returns empty messages for Cloud API status-only events', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [{ id: 'wamid.OUT1', status: 'delivered', recipient_id: '34612345678' }],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({ messages: [] });
  });

  it('collects messages across multiple entries/changes', () => {
    const body = {
      entry: [
        { changes: [{ value: { messages: [{ id: 'a', from: '1', type: 'text', text: { body: 'x' } }] } }] },
        {
          changes: [
            { value: { statuses: [{ id: 's' }] } },
            { value: { messages: [{ id: 'b', from: '2', type: 'image' }] } },
          ],
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({
      messages: [
        { id: 'a', from: '1', type: 'text', text: 'x' },
        { id: 'b', from: '2', type: 'image', text: null },
      ],
    });
  });

  it('carries the emoji as text for reaction messages', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.REACT1',
                    from: '34612345678',
                    type: 'reaction',
                    reaction: { message_id: 'wamid.BOT1', emoji: '👍' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundPayload(body)).toEqual({
      messages: [
        { id: 'wamid.REACT1', from: '34612345678', type: 'reaction', text: '👍' },
      ],
    });
    // Removing a reaction sends type 'reaction' with no emoji — text null
    expect(parseInboundPayload({
      messages: [{ id: 'r2', from: '1', type: 'reaction', reaction: { message_id: 'wamid.BOT1' } }],
    })).toEqual({
      messages: [{ id: 'r2', from: '1', type: 'reaction', text: null }],
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
