export const createOperationGate = () => {
  let revision = 0;
  return {
    start: (): (() => boolean) => {
      const operation = ++revision;
      return () => operation === revision;
    },
    cancel: (): void => {
      revision += 1;
    },
  };
};
