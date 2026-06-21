export function utcTimestamp(): string {
  return new Date().toISOString();
}

export function filenameTimestamp(date = new Date()): string {
  return date.toISOString().replace(/:/g, "-");
}

export function timestampForArchive(date = new Date()): string {
  return filenameTimestamp(date);
}
