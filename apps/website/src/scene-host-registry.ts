export interface RegisteredSceneHost<Canvas> {
  readonly canvas: Canvas;
  dispose: () => Promise<void> | void;
}

export interface SceneHostRegistry<Canvas, Host extends RegisteredSceneHost<Canvas>> {
  acquire: (canvas: Canvas) => Host;
  forget: (host: Host) => void;
  recreate: (canvas: Canvas) => Promise<Host>;
}

export const createSceneHostRegistry = <Canvas, Host extends RegisteredSceneHost<Canvas>>(
  create: (canvas: Canvas) => Host,
): SceneHostRegistry<Canvas, Host> => {
  let current: Host | null = null;
  let recreation = Promise.resolve();

  const replace = (canvas: Canvas): Host => {
    void current?.dispose();
    current = create(canvas);
    return current;
  };

  return {
    acquire: (canvas) => {
      if (current?.canvas === canvas) return current;
      return replace(canvas);
    },
    forget: (host) => {
      if (current === host) current = null;
    },
    recreate: (canvas) => {
      const operation = recreation.then(async () => {
        const previous = current;
        current = null;
        await previous?.dispose();
        const replacement = create(canvas);
        current = replacement;
        return replacement;
      });
      recreation = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
};
