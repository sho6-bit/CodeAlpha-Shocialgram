function serialize(value, stripSensitiveFields = false) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => serialize(item, stripSensitiveFields));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !stripSensitiveFields || (key !== "password" && key !== "password_hash"))
        .map(([key, nestedValue]) => [key, serialize(nestedValue, stripSensitiveFields)]),
    );
  }
  return value;
}

export function toJsonSafe(value) {
  return serialize(value);
}

export function toPublicUser(user) {
  return serialize(user, true);
}
