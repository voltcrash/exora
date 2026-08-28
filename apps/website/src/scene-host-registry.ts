export interface RegisteredSceneHost<Canvas> {
  readonly canvas: Canvas;
  dispose: () => Promise<void> | void;
}

export interface SceneHostRegistry<Canvas, Host extends RegisteredSceneHost<Canvas>> {
  acquire: (canvas: Canvas) => Host;
  /** Forgets a host that disposed itself outside the registry. */
  forget: (host: Host) => void;
  recreate: (canvas: Canvas) => Promise<Host>;
}

/** Keeps ordinary mounts on one renderer while allowing explicit recovery to replace it safely. */
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
      // A rapid second retry must wait for the first replacement to finish, even if creating it
      // failed. Otherwise two engines can once again ask the same canvas for a context together.
      recreation = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
};
