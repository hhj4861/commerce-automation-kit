// Public terminal entry point. Browser worker and this client share the same
// scenario, approval, media, narration, timeline and final inspection engine.
import {runHybridCli} from './studio-hybrid-cli.mjs';
try{console.log(JSON.stringify(await runHybridCli(process.argv.slice(2)),null,2));}
catch(error){console.error(error.message);process.exitCode=1;}
