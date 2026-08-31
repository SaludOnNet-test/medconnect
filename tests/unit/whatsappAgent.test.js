import { describe, it, expect, vi, beforeEach } from 'vitest';

// The turn runner talks to the Anthropic API and to the offers module; both
// are stubbed so the tool loop itself can be asserted without network or DB.
const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() {
      this.messages = { create };
    }
  },
}));

const findConcreteOffers = vi.fn();
vi.mock('@/lib/whatsappOffers', () => ({
  findConcreteOffers: (...args) => findConcreteOffers(...args),
  formatSlotDate: (d) => `fecha(${d})`,
}));

const { runAssistantTurn, AVAILABILITY_TOOL, SYSTEM_PROMPT } = await import('@/lib/whatsappAgent');

const textReply = (text) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
});

const toolCall = (input) => ({
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: 'Déjame mirar la disponibilidad…' },
    { type: 'tool_use', id: 'toolu_1', name: AVAILABILITY_TOOL.name, input },
  ],
});

beforeEach(() => {
  create.mockReset();
  findConcreteOffers.mockReset();
});

describe('runAssistantTurn', () => {
  it('devuelve el texto cuando el modelo no usa herramientas', async () => {
    create.mockResolvedValueOnce(textReply('¡Hola! ¿Qué especialidad necesitas?'));
    const out = await runAssistantTurn([{ role: 'user', content: 'Hola' }]);
    expect(out).toBe('¡Hola! ¿Qué especialidad necesitas?');
    expect(create).toHaveBeenCalledTimes(1);
    expect(findConcreteOffers).not.toHaveBeenCalled();
  });

  it('resuelve la llamada a buscar_disponibilidad y devuelve la respuesta final', async () => {
    findConcreteOffers.mockResolvedValueOnce([{
      clinicName: 'Centro Médico Cea Bermúdez',
      address: 'Calle Cea Bermúdez, 61',
      city: 'Madrid',
      slotDate: '2026-09-07',
      slotTime: '11:15',
      priorityFee: 16,
      procedureName: 'Consulta de Ginecología y obstetricia',
      procedurePrice: 41,
      totalWithoutInsurance: 57,
      link: 'https://medconnect.es/search-v2?x=1',
      summary: 'resumen de la oferta',
    }]);
    create
      .mockResolvedValueOnce(toolCall({ especialidad: 'Ginecología', ciudad: 'Madrid' }))
      .mockResolvedValueOnce(textReply('Te propongo Cea Bermúdez, Calle Cea Bermúdez 61: total 57 €.'));

    const out = await runAssistantTurn([{ role: 'user', content: 'Ginecología en Madrid' }]);

    expect(findConcreteOffers).toHaveBeenCalledWith(
      expect.objectContaining({ specialty: 'Ginecología', city: 'Madrid' }),
    );
    expect(out).toBe('Te propongo Cea Bermúdez, Calle Cea Bermúdez 61: total 57 €.');

    // Second call must carry assistant tool_use + the user tool_result.
    const secondCall = create.mock.calls[1][0];
    const toolResult = secondCall.messages.at(-1);
    expect(toolResult.role).toBe('user');
    expect(toolResult.content[0].type).toBe('tool_result');
    expect(toolResult.content[0].tool_use_id).toBe('toolu_1');
    expect(toolResult.content[0].content).toContain('Cea Bermúdez');
  });

  it('sigue respondiendo si la búsqueda de disponibilidad falla', async () => {
    findConcreteOffers.mockRejectedValueOnce(new Error('DB caída'));
    create
      .mockResolvedValueOnce(toolCall({ especialidad: 'Cardiología' }))
      .mockResolvedValueOnce(textReply('Ahora mismo no puedo consultar huecos, aquí tienes el buscador.'));

    const out = await runAssistantTurn([{ role: 'user', content: 'Cardiología' }]);
    expect(out).toBe('Ahora mismo no puedo consultar huecos, aquí tienes el buscador.');
    const toolResult = create.mock.calls[1][0].messages.at(-1);
    expect(toolResult.content[0].content).toContain('No se pudo consultar');
  });

  it('avisa al modelo cuando no hay ofertas en lugar de inventar', async () => {
    findConcreteOffers.mockResolvedValueOnce([]);
    create
      .mockResolvedValueOnce(toolCall({ especialidad: 'Podología', ciudad: 'Teruel' }))
      .mockResolvedValueOnce(textReply('No tengo huecos publicados ahí.'));

    await runAssistantTurn([{ role: 'user', content: 'Podología en Teruel' }]);
    const payload = JSON.parse(create.mock.calls[1][0].messages.at(-1).content[0].content);
    expect(payload.ofertas).toEqual([]);
    expect(payload.nota).toMatch(/No hay huecos publicados/);
  });

  it('corta el bucle de herramientas y devuelve el texto disponible', async () => {
    findConcreteOffers.mockResolvedValue([]);
    // El modelo insiste en llamar a la herramienta en cada vuelta.
    create.mockResolvedValue(toolCall({ especialidad: 'Ginecología' }));

    const out = await runAssistantTurn([{ role: 'user', content: 'Ginecología' }]);

    // 1 llamada inicial + MAX_TOOL_ROUNDTRIPS (2) reintentos.
    expect(create).toHaveBeenCalledTimes(3);
    expect(out).toBe('Déjame mirar la disponibilidad…');
  });

  it('ofrece la herramienta en todas las llamadas', async () => {
    create.mockResolvedValueOnce(textReply('hola'));
    await runAssistantTurn([{ role: 'user', content: 'Hola' }]);
    expect(create.mock.calls[0][0].tools).toEqual([AVAILABILITY_TOOL]);
  });
});

describe('SYSTEM_PROMPT', () => {
  it('prohíbe la evasiva que provocó el feedback del 2026-08-23', () => {
    expect(SYSTEM_PROMPT).toContain('lo verás al entrar en el link');
    expect(SYSTEM_PROMPT).toContain('PROHIBIDO');
  });

  it('exige el ejemplo concreto con dirección y total', () => {
    expect(SYSTEM_PROMPT).toContain('EJEMPLO CONCRETO OBLIGATORIO');
    expect(SYSTEM_PROMPT).toContain('buscar_disponibilidad');
  });
});
