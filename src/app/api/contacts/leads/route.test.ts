import { describe, it, expect } from 'vitest';
import { classifyLeadAction } from './route';

describe('classifyLeadAction', () => {
  it('correctly classifies explicit register keywords', () => {
    expect(classifyLeadAction('Register Now').action).toBe('register');
    expect(classifyLeadAction('I want to register').action).toBe('register');
    expect(classifyLeadAction('how to do registration?').action).toBe('register');
    expect(classifyLeadAction('book my slot').action).toBe('register');
    expect(classifyLeadAction('please send pay link').action).toBe('register');
    expect(classifyLeadAction('where to pay fees?').action).toBe('register');
    expect(classifyLeadAction('https://rzp.io/rzp/facebs').action).toBe('register');
  });

  it('correctly classifies session details and face yoga keywords', () => {
    expect(classifyLeadAction('Session Details').action).toBe('session');
    expect(classifyLeadAction('Please send details').action).toBe('session');
    expect(classifyLeadAction('Tell me about face yoga').action).toBe('session');
    expect(classifyLeadAction('faceyoga timing?').action).toBe('session');
    expect(classifyLeadAction('22month face yoga classes').action).toBe('session');
    expect(classifyLeadAction('zoom class schedule').action).toBe('session');
  });

  it('correctly classifies interactive button payloads', () => {
    expect(classifyLeadAction('', 'btn_register_now').action).toBe('register');
    expect(classifyLeadAction('', 'btn_session_details').action).toBe('session');
    expect(classifyLeadAction('', '22monthsfaceyoga').action).toBe('session');
  });

  it('provides a clean actionLabel for other inquiries', () => {
    const res = classifyLeadAction('Namaste! Can I join?');
    // 'join' matches register intent
    expect(res.action).toBe('register');

    const general = classifyLeadAction('Hello, is this available?');
    expect(general.action).toBe('session');
    expect(general.actionLabel).toBe('Replied: "Hello, is this available?"');
  });
});
