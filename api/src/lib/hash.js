import { createHash } from 'node:crypto';

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function hashBody(body) {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(body))).digest('hex');
}
