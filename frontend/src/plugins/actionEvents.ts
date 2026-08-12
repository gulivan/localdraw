export const PLUGIN_ACTION_EVENT = "localdraw:open-plugin-action";

export const openPluginAction = (actionId: string): void => {
  window.dispatchEvent(new CustomEvent(PLUGIN_ACTION_EVENT, { detail: { actionId } }));
};

export const listenForPluginAction = (
  actionId: string,
  callback: () => void,
): (() => void) => {
  const listener = (event: Event) => {
    if ((event as CustomEvent<{ actionId?: string }>).detail?.actionId === actionId) callback();
  };
  window.addEventListener(PLUGIN_ACTION_EVENT, listener);
  return () => window.removeEventListener(PLUGIN_ACTION_EVENT, listener);
};
