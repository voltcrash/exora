export interface RegisteredSceneHost<Canvas> {
  readonly canvas: Canvas;
  dispose: () => Promise<void> | void;
}

export interface SceneHostRegistry<Canvas, Host extends RegisteredSceneHost<Canvas>> {
  acquire: (canvas: Canvas) => Promise<Host>;
  forget: (host: Host) => void;
  recreate: (canvas: Canvas) => Promise<Host>;
}

export const createSceneHostRegistry = <Canvas, Host extends RegisteredSceneHost<Canvas>>(
  create: (canvas: Canvas) => Host,
): SceneHostRegistry<Canvas, Host> => {
  let current: Host | null = null;
  let recreation = Promise.resolve();

  const schedule = (canvas: Canvas, force: boolean): Promise<Host> => {
    const operation = recreation.then(async () => {
      if (!force && current?.canvas === canvas) return current;
      const previous = current;
      current = null;
      await previous?.dispose();
      current = create(canvas);
      return current;
    });
    recreation = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  return {
    acquire: (canvas) => schedule(canvas, false),
    forget: (host) => {
      if (current === host) current = null;
    },
    recreate: (canvas) => schedule(canvas, true),
  };
};
