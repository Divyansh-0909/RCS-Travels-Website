import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

// The installed Base UI primitive measures the panel and retains it through
// interrupted transitions, then unmounts it when closing finishes.
function Collapsible(props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger(props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent(props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
