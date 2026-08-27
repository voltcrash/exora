export interface RegisteredSceneHost<Canvas> {
  readonly canvas: Canvas;
  dispose: () => void;
}

export interface SceneHostRegistry<Canvas, Host extends RegisteredSceneHost<Canvas>> {
  acquire: (canvas: Canvas) => Host;
  /** Forgets a host that disposed itself outside the registry. */
  forget: (host: Host) => void;
  recreate: (canvas: Canvas) => Host;
}

/** Keeps ordinary mounts on one renderer while allowing explicit recovery to replace it safely. */
export const createSceneHostRegistry = <Canvas, Host extends RegisteredSceneHost<Canvas>>(
  create: (canvas: Canvas) => Host,
): SceneHostRegistry<Canvas, Host> => {
  let current: Host | null = null;

  const replace = (canvas: Canvas): Host => {
    current?.dispose();
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
    recreate: replace,
  };
};
