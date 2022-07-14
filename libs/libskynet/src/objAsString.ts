// objAsString will try to return the provided object as a string. If the
// object is already a string, it will be returned without modification. If the
// object is an 'Error', the message of the error will be returned. If the object
// has a toString method, the toString method will be called and the result
// will be returned. If the object is null or undefined, a special string will
// be returned indicating that the undefined/null object cannot be converted to
// a string. In all other cases, JSON.stringify is used. If JSON.stringify
// throws an exception, a message "[could not provide object as string]" will
// be returned.
//
// NOTE: objAsString is intended to produce human readable output. It is lossy,
// and it is not intended to be used for serialization.
function objAsString(obj: any): string {
  // Check for undefined input.
  if (obj === undefined) {
    return "[cannot convert undefined to string]";
  }
  if (obj === null) {
    return "[cannot convert null to string]";
  }

  // Parse the error into a string.
  if (typeof obj === "string") {
    return obj;
  }

  // Check if the object is an error, and return the message of the error if
  // so.
  if (obj instanceof Error) {
    return obj.message;
  }

  // Check if the object has a 'toString' method defined on it. To ensure
  // that we don't crash or throw, check that the toString is a function, and
  // also that the return value of toString is a string.
  if (Object.prototype.hasOwnProperty.call(obj, "toString")) {
    if (typeof obj.toString === "function") {
      const str = obj.toString();
      if (typeof str === "string") {
        return str;
      }
    }
  }

  // If the object does not have a custom toString, attempt to perform a
  // JSON.stringify. We use a lot of bigints in libskynet, and calling
  // JSON.stringify on an object with a bigint will cause a throw, so we add
  // some custom handling to allow bigint objects to still be encoded.
  try {
    return JSON.stringify(obj, (_, v) => {
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    });
  } catch (err: any) {
    if (err !== undefined && typeof err.message === "string") {
      return `[stringify failed]: ${err.message}`;
    }
    return "[stringify failed]";
  }
}

export { objAsString };
