export function utcTimestamp() {
    return new Date().toISOString();
}
export function filenameTimestamp(date = new Date()) {
    return date.toISOString().replace(/:/g, "-");
}
export function timestampForArchive(date = new Date()) {
    return filenameTimestamp(date);
}
//# sourceMappingURL=time.js.map