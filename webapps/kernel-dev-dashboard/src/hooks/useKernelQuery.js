import { useState, useCallback } from "react";
import { newKernelQuery } from "libkernel";

export const useKernelQuery = (method, defaultData, sendUpdates) => {
  const [isPending, setIsPending] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const initQuery = useCallback(async (data) => {
    setIsPending(true);

    const [, responsePromise] = newKernelQuery(method, data || defaultData, sendUpdates);
    const [result, error] = await responsePromise;

    if (error !== null) {
      setResponse(null);
      setError(error);
    } else {
      setError(null);
      setResponse(result);
    }

    setIsPending(false);
  }, [method, defaultData, sendUpdates]);

  return {
    isPending,
    error,
    response,
    initQuery
  };
}
