import test from 'node:test'
import assert from 'node:assert/strict'
import { whatsappTemplateComponents } from '../services/notification.js'

test('WhatsApp template body and dynamic URL buttons use separate components', () => {
  assert.deepEqual(whatsappTemplateComponents({
    body: ['RCS1234567', 'Rahul', 1250],
    buttons: [{ index: 0, text: '550e8400-e29b-41d4-a716-446655440000' }],
  }), [
    { type: 'body', parameters: [
      { type: 'text', text: 'RCS1234567' },
      { type: 'text', text: 'Rahul' },
      { type: 'text', text: '1250' },
    ] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [
      { type: 'text', text: '550e8400-e29b-41d4-a716-446655440000' },
    ] },
  ])
})

test('static-button templates do not send nonexistent button parameters', () => {
  assert.deepEqual(whatsappTemplateComponents({ body: ['RCS1234567'] }), [
    { type: 'body', parameters: [{ type: 'text', text: 'RCS1234567' }] },
  ])
})
