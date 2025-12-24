import { usePersistedState } from "./usePersistedState";

export const useDraftVisibility = () => {
  const [showDraftTab, setShowDraftTab] = usePersistedState<boolean>("dumphoops-show-draft-tab", false);
  return { showDraftTab, setShowDraftTab };
};
