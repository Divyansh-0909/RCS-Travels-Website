import React, { useState } from 'react';
import Button from './Button';
import Input from './Input';
import Toggle from './Toggle';
import SettingRow from './SettingRow';
import EmptyState from './EmptyState';
import FailureState from './FailureState';
import Skeleton from './Skeleton';

export default { title: 'RCS/Existing controls', parameters: { chromatic: { viewports: [390, 1440] } } };
export const Buttons = { render: () => <div className="flex flex-col gap-4"><Button prop={{}}>Continue</Button><Button prop={{ variant: 'negative' }}>Cancel</Button><Button prop={{ disabled: true }}>Unavailable</Button><Button prop={{ disabled: true }}>Loading…</Button></div> };
function SwitchExamples() {
  const [on, setOn] = useState(true);
  return <ul className="max-w-xl"><SettingRow trailing={<Toggle on={on} onClick={() => setOn(!on)} aria-label="Ride updates" />}><h2>Ride updates</h2><p>Booking confirmations on WhatsApp.</p></SettingRow><SettingRow trailing={<Toggle on={false} disabled aria-label="Unavailable setting" />}><h2>Disabled setting</h2></SettingRow></ul>;
}
export const Switches = { render: () => <SwitchExamples /> };
export const SwitchesDark = { ...Switches, globals: { theme: 'dark' } };
function FieldExamples() {
  const [value, setValue] = useState('');
  return <div className="flex flex-col gap-4"><label htmlFor="story-pickup">Pickup address</label><Input prop={{ id: 'story-pickup', name: 'pickup', value, onChangeFn: setValue, placeholder: 'Enter pickup' }} /><label htmlFor="story-invalid">Address requiring correction</label><Input prop={{ id: 'story-invalid', error: true, value, onChangeFn: setValue, placeholder: 'Enter a complete address' }} /></div>;
}
export const Fields = { render: () => <FieldExamples /> };
export const Empty = { render: () => <EmptyState tone="light" title="No rides yet" message="Your ride history appears here." action={{ label: 'Book a ride', onClick: () => {} }} /> };
export const Error = { render: () => <FailureState tone="light" title="Couldn’t load rides" detail="Try again when connected." onRetry={() => {}} /> };
export const Loading = { render: () => <div aria-label="Loading preview"><Skeleton tone="light" className="h-10 w-64" /></div> };
