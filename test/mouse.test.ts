import {test,expect} from 'bun:test';
import {mouseSequence,mouseModifierBits} from '../src/mouse';
test('mouse protocols preserve SGR release, modifiers, legacy bytes and UTF-8 coordinates',()=>{expect(mouseSequence(64,3,2,'sgr')).toBe('\x1b[<64;3;2M');expect(mouseSequence(0,3,2,'sgr',true)).toBe('\x1b[<0;3;2m');expect(mouseModifierBits({shift:true,alt:true,ctrl:true})).toBe(28);expect(Buffer.from(mouseSequence(64,161,10,'legacy'),'latin1')).toEqual(Buffer.from([27,91,77,96,193,42]));expect(mouseSequence(0,500,300,'utf8').codePointAt(4)).toBe(532);});
