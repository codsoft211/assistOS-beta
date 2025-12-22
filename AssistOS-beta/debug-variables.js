#!/usr/bin/env node

// Test variable resolution logic
const context = {
  variables: {
    trigger: {
      triggeredAt: '2024-01-01T00:00:00.000Z',
      data: {
        name: 'John Doe',
        email: 'john.doe@example.com'
      },
      name: 'John Doe',
      email: 'john.doe@example.com'
    }
  }
};

function getValueByPath(path, context) {
  const parts = path.split('.');
  let value = context.variables;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

function resolveString(str, context) {
  // Check if entire string is a template variable
  const fullMatch = str.match(/^{{(.+?)}}$/);
  if (fullMatch) {
    const path = fullMatch[1].trim();
    return getValueByPath(path, context);
  }

  // Replace inline templates
  return str.replace(/{{(.+?)}}/g, (_, path) => {
    const value = getValueByPath(path.trim(), context);
    return value !== undefined ? String(value) : '';
  });
}

// Test cases
console.log('Testing variable resolution:');
console.log('Context variables:', JSON.stringify(context.variables, null, 2));
console.log('');

const testCases = [
  '{{trigger.data.name}}',
  '{{trigger.data.email}}',
  '{{trigger.name}}',
  '{{trigger.email}}'
];

testCases.forEach(test => {
  const result = resolveString(test, context);
  console.log(`${test} -> ${JSON.stringify(result)}`);
});