import fs from 'node:fs';
const file=fs.existsSync('.env.local')?fs.readFileSync('.env.local','utf8'):'';
for(const line of file.split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
const checks={url:process.env.NEXT_PUBLIC_SUPABASE_URL==='https://skiimthwadramxdzhgoy.supabase.co',publishableKey:!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'),paymentsDisabled:process.env.PAYMENT_PROVIDER==='disabled',memberIntegrationDisabled:process.env.RIWAY_INTEGRATION==='disabled',siteUrl:!!process.env.NEXT_PUBLIC_SITE_URL};
console.log(checks);if(Object.values(checks).some(v=>!v))process.exitCode=1;
