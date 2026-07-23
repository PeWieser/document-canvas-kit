import { useDocumentStore } from "./documentStore";
import type { DocumentState, PageSize } from "./createDocumentState";

export type { PageSize, DocumentState };

function getActiveOrFallback(): DocumentState {
  const store = useDocumentStore.getState();
  const active = store.getActive();
  if (active) return active;
  const id = store.openDocument();
  return store.documents.get(id)!;
}

/**
 * Backward-compatible proxy store hook that forwards actions and state access
 * to documentStore.getActive().
 */
export function useEditor<T = DocumentState>(selector?: (state: DocumentState) => T): T {
  return useDocumentStore((docStore) => {
    const activeDoc = docStore.getActive() ?? getActiveOrFallback();
    return selector ? selector(activeDoc) : (activeDoc as unknown as T);
  });
}

useEditor.getState = (): DocumentState => {
  return getActiveOrFallback();
};

useEditor.setState = (
  partial: Partial<DocumentState> | ((state: DocumentState) => Partial<DocumentState>),
) => {
  const active = getActiveOrFallback();
  const next = typeof partial === "function" ? partial(active) : partial;
  useDocumentStore.getState().updateActive((doc) => {
    Object.assign(doc, next);
  });
};

useEditor.subscribe = (
  listener: (state: DocumentState, previousState: DocumentState) => void,
) => {
  let prevActive = getActiveOrFallback();
  return useDocumentStore.subscribe(() => {
    const currentActive = getActiveOrFallback();
    if (currentActive !== prevActive) {
      const old = prevActive;
      prevActive = currentActive;
      listener(currentActive, old);
    }
  });
};
