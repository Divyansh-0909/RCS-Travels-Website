// Imported before the isolated preview mounts React. Use the real store setter:
// scheduledTime is deliberately not persisted and cannot be seeded as JSON.
import {useData as __rcsConsistencyStore} from '/src/hooks/useData.js';
if(['VCB01_VEHICLE_ACTION','VCB01_VEHICLE_CARD'].includes(window.__RCS_CONSISTENCY_CASE__?.id)){
  __rcsConsistencyStore.getState().setScheduledTime(new Date(Math.ceil((Date.now()+60*60_000)/900_000)*900_000));
}
