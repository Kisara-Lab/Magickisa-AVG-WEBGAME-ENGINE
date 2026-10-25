export function defineField(object, key, value) {
  Object.defineProperty(object, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value,
  });
  return value;
}
