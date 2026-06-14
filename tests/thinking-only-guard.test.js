#!/usr/bin/env node
const TOOL_OPEN = '<tool_call>';
const TOOL_CLOSE = '</tool_call>';
function countToolCalls(t){return t.split(TOOL_OPEN).length-1;}
function extractAllToolCalls(t){const r=[];let i=0;for(;;){const a=t.indexOf(TOOL_OPEN,i);if(a===-1)break;const b=t.indexOf(TOOL_CLOSE,a);if(b===-1)break;r.push(t.slice(a,b+TOOL_CLOSE.length));i=b+TOOL_CLOSE.length;}return r;}
function wouldThinking(text,c){
  const n=countToolCalls(text);
  const hasText=typeof c==="string"?c.trim().length>0:Array.isArray(c)?c.some(x=>x.type==="text"&&x.text&&x.text.trim().length>0):false;
  const hasTC=Array.isArray(c)?c.some(x=>x.type==="toolCall"):false;
  return n>=1&&!hasText&&!hasTC;
}
let p=0,f=0;
function assert(name,a,e){if(a===e){p++;console.log("  ✓ "+name);}else{f++;console.log("  ✗ "+name+" (got "+a+", expected "+e+")");}}
function assertCount(name,actual,expected){if(actual===expected){p++;console.log("  ✓ "+name);}else{f++;console.log("  ✗ "+name+" (got "+actual+", expected "+expected+")");}}
console.log("thinking-only-guard tests (multi-call version)");

// --- wouldThinking (should trigger) ---
assert("read in thinking, no text",wouldThinking('<tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);
assert("bash in thinking, no text",wouldThinking('<tool_call>\n<function=bash>\n<parameter=command>\necho hello\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);
assert("two tool calls in thinking, no text",wouldThinking('<tool_call>\n<function=bash>\n<parameter=command>\necho a\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=bash>\n<parameter=command>\nls\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);
assert("bash + read in thinking, no text",wouldThinking('<tool_call>\n<function=bash>\n<parameter=command>\nls\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);
assert("bash + read + bash in thinking, no text",wouldThinking('<tool_call>\n<function=bash>\n<parameter=command>\nls\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=bash>\n<parameter=command>\npwd\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);
assert("tool call + text before it, still 1 tc",wouldThinking('No model.json found.\n\n<tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"}]),true);

// --- wouldThinking (should NOT trigger) ---
assert("read + text block",wouldThinking('<tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"},{type:"text",text:"x"}]),false);
assert("read + real toolCall",wouldThinking('<tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>',[{type:"thinking"},{type:"toolCall",id:"tc1"}]),false);
assert("plain thinking, no tool calls",wouldThinking('This is your home directory with quite a lot of files.',[{type:"thinking"}]),false);
assert("empty thinking",wouldThinking('',[{type:"thinking",thinking:""}]),false);

// --- extractAllToolCalls ---
assertCount("extract 1 tool call",extractAllToolCalls('<tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call>').length,1);
assertCount("extract 2 tool calls",extractAllToolCalls('<tool_call>\n<function=bash>\n<parameter=command>\necho a\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=bash>\n<parameter=command>\nls\n</parameter>\n</function>\n</tool_call>').length,2);
assertCount("extract 3 tool calls",extractAllToolCalls('<tool_call>\n<function=bash>\n<parameter=command>\nls\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=read>\n<parameter=path>\n/home/reluxa/.profile\n</parameter>\n</function>\n</tool_call><tool_call>\n<function=bash>\n<parameter=command>\npwd\n</parameter>\n</function>\n</tool_call>').length,3);
assertCount("no tool calls",extractAllToolCalls('This is your home directory with quite a lot of files.').length,0);

console.log("passed: "+p+", failed: "+f);
process.exit(f>0?1:0);