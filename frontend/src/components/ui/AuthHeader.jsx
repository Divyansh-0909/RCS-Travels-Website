import { mdiKeyboardBackspace } from '@mdi/js';
import BrandWordmark from './BrandWordmark';
import IconButton from './IconButton';

const AuthHeader = ({ onBack }) => (
    <div className="absolute inset-x-0 top-0 z-10 border border-transparent px-3 py-3 sm:py-6">
        {/* Match the landing navbar's border, padding and row height. */}
        <div className="relative flex min-h-8 items-center justify-center sm:min-h-10">
            <IconButton
                aria-label="Back"
                onClick={onBack}
                icon={mdiKeyboardBackspace}
                className="absolute -left-0.5"
            />
            <BrandWordmark as="p" className="pointer-events-none w-full whitespace-normal! break-words px-[calc(2.75rem+4px)] text-center text-[var(--text)]" />
        </div>
    </div>
);

export default AuthHeader;
