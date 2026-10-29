import { describe, it, expect } from 'vitest';
import { dueliTruncateAttrs } from '../../src/lib/userTextDisplay';

describe('UNIT35.2 userTextDisplay', () => {
    it('emits truncation hooks with escaped attribute values', () => {
        const attrs = dueliTruncateAttrs('A & B "long"');
        expect(attrs).toContain('data-dueli-truncate="1"');
        expect(attrs).toContain('title="A &amp; B &quot;long&quot;"');
        expect(attrs).toContain('data-full-text="A &amp; B &quot;long&quot;"');
    });
});
