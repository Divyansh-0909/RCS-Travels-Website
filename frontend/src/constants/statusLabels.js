import { websiteCopy as dc } from "../i18nCopy";
export const statusLabels = {
  get pending() { return dc("Finding your driver"); },
  get payment_pending() { return dc("Advance payment required"); },
  get confirmed() { return dc("Confirmed"); },
  get assigned() { return dc("Driver assigned"); },
  get en_route() { return dc("Driver on the way"); },
  get reached() { return dc("Driver arrived"); },
  get started() { return dc("On trip"); },
  get completed() { return dc("Completed"); },
  get cancelled() { return dc("Cancelled"); },
};
