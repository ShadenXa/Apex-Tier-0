// Apex Tier 0 — Audio Engine
// zzfx mini synth + sfx wrapper + MaestroV4 procedural music

// Note: S.soundOn and bgm are accessed via window globals
// These are set up by state.js and game.js respectively

// ═══ ZZFX MINI SYNTH ═══════════════════════════════════════
const zzfx=(...p)=>{if(!S.soundOn)return;try{const a=zzfxCtx||(zzfxCtx=new(window.AudioContext||window.webkitAudioContext)),b=a.createBufferSource(),c=a.createBuffer(1,~~(a.sampleRate*.5),a.sampleRate),d=c.getChannelData(0);zzfxG(...p).forEach((v,i)=>d[i]=v);b.buffer=c;b.connect(a.destination);b.start();}catch(e){}};
let zzfxCtx;
const zzfxG=(vol=1,freq=220,attack=0,sustain=0,release=.1,shape=0,shapeCurve=1,slide=0,noise=0)=>{
const sR=44100,len=~~(sR*(attack+sustain+release)),out=new Float32Array(len);
let f=freq,t=0;
for(let i=0;i<len;i++){
const p=i/sR;let env;
if(p<attack)env=p/attack;else if(p<attack+sustain)env=1;else env=1-(p-attack-sustain)/release;
env=Math.max(0,env)*vol;f+=slide;t+=f/sR;
let v;
if(shape===0)v=Math.sin(t*Math.PI*2);
else if(shape===1)v=(t%1<.5?1:-1);
else if(shape===2)v=(t%1)*2-1;
else v=Math.random()*2-1;
v=Math.pow(Math.abs(v),shapeCurve)*Math.sign(v);
if(noise)v+=Math.random()*noise*2-noise;
out[i]=v*env*.3;
}return out;};

function sfx(type){
if(!S.soundOn)return;
try{if(zzfxCtx&&zzfxCtx.state==='suspended')zzfxCtx.resume();}catch(e){}
const s={
attack:()=>zzfx(.3,440,.01,.02,.08,1,1,10,.1),
crit:()=>zzfx(.4,660,.01,.03,.1,2,1,20,.1),
special:()=>{zzfx(.3,523,.02,.05,.15,0);setTimeout(()=>zzfx(.3,784,.02,.05,.2,0),80)},
summon:()=>{zzfx(.2,220,.05,.1,.2,0);setTimeout(()=>zzfx(.2,440,.05,.1,.3,0),100)},
victory:()=>{zzfx(.3,523,.03,.08,.2,0);setTimeout(()=>zzfx(.3,659,.03,.08,.2,0),120);setTimeout(()=>zzfx(.3,784,.03,.08,.3,0),240);if(bgm&&bgm.isPlaying){bgm.tempo=110;setTimeout(()=>{if(bgm)bgm.tempo=90;},3000);}},
defeat:()=>zzfx(.3,180,.05,.2,.3,2,2,0,.05),
heal:()=>{zzfx(.2,660,.02,.06,.12,0);setTimeout(()=>zzfx(.2,880,.02,.06,.15,0),60)},
click:()=>zzfx(.1,800,.005,.01,.05,1),
};
(s[type]||s.click)();
}


'use strict';

class MaestroV4 {
    constructor(){
        this.ctx=null;this._audioReady=false;this.isPlaying=false;
        this.tempo=88;this.intensity='menu';this._schedId=null;
        this.beat=0;this.chordStep=0;this.barCount=0;this.sectionCount=0;
        this.nextNoteTime=0;this._pausedByVisibility=false;

        // ── EXPANDED SCALE LIBRARY ──
        this.scales={
            dorian:    [0,2,3,5,7,9,10],
            aeolian:   [0,2,3,5,7,8,10],
            pentatonic:[0,2,4,7,9],
            harmMinor: [0,2,3,5,7,8,11],
            lydian:    [0,2,4,6,7,9,11],
            mixolydian:[0,2,4,5,7,9,10],
            phrygian:  [0,1,3,5,7,8,10],
            wholetone: [0,2,4,6,8,10],
        };
        this.scaleKeys=Object.keys(this.scales);
        this.scale=this.scales.dorian;
        this.rootNote=50;
        this.nextRoot=50;
        this.modulationTimer=0;

        // ── EXPANDED PROGRESSIONS (8 per mood) ──
        this.progressions={
            menu:[
                [[0,0],[3,3],[5,5],[3,3]],
                [[0,0],[5,5],[3,3],[6,6]],
                [[0,0],[2,2],[5,5],[4,4]],
                [[0,0],[4,4],[6,6],[5,5]],
                [[3,3],[5,5],[0,0],[6,6]],
                [[0,0],[6,6],[3,3],[5,5]],
                [[5,5],[3,3],[6,6],[0,0]],
                [[0,0],[3,3],[6,6],[4,4]],
            ],
            player:[
                [[0,0],[5,5],[3,3],[6,6]],
                [[0,0],[4,4],[5,5],[3,3]],
                [[0,0],[2,2],[5,5],[0,0]],
                [[3,3],[0,0],[5,5],[6,6]],
                [[0,0],[6,6],[5,5],[3,3]],
                [[0,0],[3,3],[5,5],[2,2]],
                [[5,5],[0,0],[3,3],[6,6]],
                [[0,0],[5,5],[6,6],[3,3]],
            ],
            enemy:[
                [[0,0],[1,1],[5,5],[4,4]],
                [[0,0],[5,5],[1,1],[3,3]],
                [[0,0],[3,3],[1,1],[5,5]],
                [[5,5],[4,4],[0,0],[1,1]],
                [[0,0],[1,1],[3,3],[5,5]],
                [[3,3],[1,1],[0,0],[5,5]],
                [[0,0],[4,4],[1,1],[5,5]],
                [[1,1],[0,0],[5,5],[3,3]],
            ],
            victory:[
                [[0,0],[5,5],[3,3],[0,0]],
                [[0,0],[3,3],[5,5],[0,0]],
                [[0,0],[4,4],[5,5],[0,0]],
                [[5,5],[3,3],[0,0],[5,5]],
                [[0,0],[6,6],[5,5],[0,0]],
                [[0,0],[2,2],[5,5],[0,0]],
                [[3,3],[5,5],[0,0],[3,3]],
                [[0,0],[5,5],[6,6],[0,0]],
            ],
        };
        this.progIdx=0;
        this.prog=this.progressions.menu[0];

        // ── MOTIF MEMORY for melody coherence ──
        this.motif=[];
        this.motifLength=0;
        this.motifTimer=0;

        // ── RHYTHM PATTERNS ──
        this.rhythmPatterns=[
            [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
            [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0],
            [1,0,1,0, 0,1,0,1, 1,0,0,1, 0,1,0,0],
            [1,1,0,0, 1,0,0,1, 1,1,0,0, 1,0,1,0],
            [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1],
            [0,1,0,1, 0,1,0,1, 1,0,1,0, 0,1,0,1],
        ];
        this.currentRhythm=this.rhythmPatterns[0];

        // ── SECTION TYPES ──
        this.sectionTypes=['verse','verse','chorus','verse','bridge','chorus','outro','verse'];
        this.currentSection='verse';
    }

    _ensureCtx(){
        if(this._audioReady)return;
        try{this.ctx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
        this._audioReady=true;
        this.masterGain=this.ctx.createGain();
        this.masterGain.gain.value=0.30;
        this.reverb=this.ctx.createConvolver();
        this._buildImpulse(2.4,3.0);
        this.reverbSend=this.ctx.createGain();
        this.reverbSend.gain.value=0.22;
        this.dryGain=this.ctx.createGain();
        this.dryGain.gain.value=0.78;
        this.delay=this.ctx.createDelay(1.0);
        this.delay.delayTime.value=60/this.tempo*0.75;
        this.delayFb=this.ctx.createGain();
        this.delayFb.gain.value=0.22;
        this.delaySend=this.ctx.createGain();
        this.delaySend.gain.value=0.10;
        this.dryGain.connect(this.masterGain);
        this.reverb.connect(this.reverbSend);
        this.reverbSend.connect(this.masterGain);
        this.delay.connect(this.delayFb);
        this.delayFb.connect(this.delay);
        this.delay.connect(this.delaySend);
        this.delaySend.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    _buildImpulse(decay,length){
        var sr=this.ctx.sampleRate,len=sr*length;
        var buf=this.ctx.createBuffer(2,len,sr);
        for(var ch=0;ch<2;ch++){var d=buf.getChannelData(ch);for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}
        this.reverb.buffer=buf;
    }

    _midi(n){return 440*Math.pow(2,(n-69)/12);}

    _scaleNote(degree,octave){
        octave=octave||0;
        var s=this.scale,idx=((degree%s.length)+s.length)%s.length;
        var octShift=Math.floor(degree/s.length);
        return this.rootNote+s[idx]+(octave+octShift)*12;
    }

    _playNote(midi,type,dur,vol,atk,dec,sus,rel,dest){
        if(!this.ctx||!this._audioReady)return;
        var now=this.ctx.currentTime;
        var o1=this.ctx.createOscillator(),o2=this.ctx.createOscillator();
        var g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
        o1.type=type;o2.type=type;
        o1.frequency.value=this._midi(midi);
        o2.frequency.value=this._midi(midi);
        o2.detune.value=(Math.random()-0.5)*14+5;
        f.type='lowpass';
        f.frequency.value=this.currentSection==='chorus'?2200:this.currentSection==='bridge'?800:1400;
        f.Q.value=1.0+Math.random()*0.5;
        var m=this.ctx.createGain();m.gain.value=0.5;
        o1.connect(m);o2.connect(m);m.connect(f);f.connect(g);
        g.connect(dest||this.dryGain);g.connect(this.reverb);g.connect(this.delay);
        g.gain.setValueAtTime(0,now);
        g.gain.linearRampToValueAtTime(vol,now+atk);
        g.gain.linearRampToValueAtTime(vol*sus,now+atk+dec);
        g.gain.setValueAtTime(vol*sus,now+Math.max(0,dur-rel));
        g.gain.linearRampToValueAtTime(0,now+dur);
        o1.start(now);o1.stop(now+dur+0.05);
        o2.start(now);o2.stop(now+dur+0.05);
        var ms=(dur+0.2)*1000;
        setTimeout(function(){try{o1.disconnect();o2.disconnect();m.disconnect();g.disconnect();f.disconnect();}catch(e){}},ms);
    }

    _playBass(midi,dur){
        if(!this.ctx)return;
        var now=this.ctx.currentTime;
        var o=this.ctx.createOscillator(),sub=this.ctx.createOscillator();
        var g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
        o.type='sawtooth';sub.type='sine';
        o.frequency.value=this._midi(midi);sub.frequency.value=this._midi(midi-12);
        f.type='lowpass';f.frequency.value=280;f.Q.value=2.5;
        var m=this.ctx.createGain();m.gain.value=0.5;
        o.connect(m);sub.connect(m);m.connect(f);f.connect(g);g.connect(this.dryGain);
        g.gain.setValueAtTime(0,now);
        g.gain.linearRampToValueAtTime(0.15,now+0.02);
        g.gain.exponentialRampToValueAtTime(0.01,now+dur);
        o.start(now);o.stop(now+dur+0.05);sub.start(now);sub.stop(now+dur+0.05);
        setTimeout(function(){try{o.disconnect();sub.disconnect();m.disconnect();g.disconnect();f.disconnect();}catch(e){}},
        (dur+0.2)*1000);
    }

    _playPerc(vol,type){
        if(!this.ctx)return;
        var now=this.ctx.currentTime,dur=type==='kick'?0.12:0.04;
        var buf=this.ctx.createBuffer(1,this.ctx.sampleRate*dur,this.ctx.sampleRate);
        var d=buf.getChannelData(0);
        for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,type==='kick'?3:9);
        var s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
        s.buffer=buf;f.type=type==='kick'?'lowpass':'highpass';
        f.frequency.value=type==='kick'?220:5500;
        s.connect(f);f.connect(g);g.connect(this.dryGain);
        g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(0.001,now+dur);
        s.start(now);s.stop(now+dur+0.01);
        setTimeout(function(){try{s.disconnect();g.disconnect();f.disconnect();}catch(e){}},200);
    }

    setIntensity(level){
        if(this.intensity===level)return;
        this.intensity=level;
        var moodScales={menu:'pentatonic',player:'dorian',enemy:'harmMinor',victory:'lydian'};
        var moodTempos={menu:72,player:92,enemy:78,victory:112};
        this.scale=this.scales[moodScales[level]||'dorian'];
        this.tempo=moodTempos[level]||88;
        if(this.delay)this.delay.delayTime.value=60/this.tempo*0.75;
        this._pickNewProgression();
    }

    _pickNewProgression(){
        var pool=this.progressions[this.intensity]||this.progressions.menu;
        var idx=~~(Math.random()*pool.length);
        while(idx===this.progIdx&&pool.length>1)idx=~~(Math.random()*pool.length);
        this.progIdx=idx;this.prog=pool[idx];
    }

    _modulateKey(){
        // Shift root note by a musical interval for variety
        var intervals=[0,2,5,7,-5,-3];
        var shift=intervals[~~(Math.random()*intervals.length)];
        this.rootNote=((this.rootNote-38+shift)%12)+44;
        // Occasionally change scale too
        if(Math.random()<0.3){
            var moodScales={menu:['pentatonic','lydian','dorian'],player:['dorian','mixolydian','aeolian'],
                enemy:['harmMinor','phrygian','aeolian'],victory:['lydian','pentatonic','mixolydian']};
            var pool=moodScales[this.intensity]||['dorian'];
            this.scale=this.scales[pool[~~(Math.random()*pool.length)]];
        }
    }

    _generateMotif(){
        var len=3+~~(Math.random()*4);
        this.motif=[];
        for(var i=0;i<len;i++){
            this.motif.push({
                degree:~~(Math.random()*7),
                dur:Math.random()>0.6?0.6:0.3,
                rest:Math.random()<0.2
            });
        }
        this.motifLength=len;
        this.motifTimer=0;
    }

    _advanceSection(){
        this.sectionCount++;
        var idx=this.sectionCount%this.sectionTypes.length;
        this.currentSection=this.sectionTypes[idx];
        this._pickNewProgression();
        this.currentRhythm=this.rhythmPatterns[~~(Math.random()*this.rhythmPatterns.length)];
        if(this.sectionCount%3===0)this._modulateKey();
        if(this.sectionCount%2===0)this._generateMotif();
    }

    start(){
        if(this.isPlaying)return;
        this._ensureCtx();if(!this.ctx)return;
        try{this.ctx.resume();}catch(e){}
        this.isPlaying=true;this.nextNoteTime=this.ctx.currentTime+0.1;
        this.beat=0;this.barCount=0;this.sectionCount=0;
        this._generateMotif();this._scheduler();
    }

    stop(){this.isPlaying=false;if(this._schedId){clearTimeout(this._schedId);this._schedId=null;}}

    _scheduler(){
        if(!this.isPlaying)return;
        while(this.nextNoteTime<this.ctx.currentTime+0.12){
            this._playBeat();
            this.nextNoteTime+=(60/this.tempo)/2;
            this.beat++;
        }
        this._schedId=setTimeout(()=>this._scheduler(),20);
    }

    _playBeat(){
        var localBeat=this.beat%16;

        // ── SECTION CHANGE every 64 beats (4 bars) ──
        if(this.beat>0&&this.beat%64===0)this._advanceSection();

        // ── CHORD CHANGE every 16 beats ──
        if(localBeat===0){
            this.chordStep=(this.chordStep+1)%this.prog.length;
            this.barCount++;
            if(this.chordStep===0&&Math.random()>0.35)this._pickNewProgression();
        }

        var chord=this.prog[this.chordStep];
        var root=chord[0];
        var I=this.intensity;
        var sec=this.currentSection;
        var rhythmHit=this.currentRhythm[localBeat]===1;

        if(localBeat===0){
            var padDur=(60/this.tempo)*(sec==='chorus'?10:sec==='bridge'?14:8);
            var padVol=I==='menu'?0.065:sec==='chorus'?0.055:0.045;
            this._playNote(this._scaleNote(root,-1),'sine',padDur,padVol,2.0,0.5,0.7,2.5);
            this._playNote(this._scaleNote(root+2,0),'sine',padDur,padVol*0.7,2.5,0.5,0.6,2.5);
            this._playNote(this._scaleNote(root+4,0),'sine',padDur,padVol*0.6,3.0,0.5,0.5,2.5);
            // Add 7th chord tone in chorus sections
            if(sec==='chorus')
                this._playNote(this._scaleNote(root+6,0),'sine',padDur,padVol*0.4,3.0,0.5,0.4,2.5);
        }

        if(I!=='menu'){
            if(localBeat===0){
                var bassDur=(60/this.tempo)*(sec==='chorus'?1.8:1.4);
                this._playBass(this._scaleNote(root,-2),bassDur);
            }
            if(localBeat===8&&sec!=='bridge'){
                this._playBass(this._scaleNote(root+4,-2),(60/this.tempo)*0.8);
            }
            if(localBeat===12&&sec==='chorus'){
                this._playBass(this._scaleNote(root+2,-2),(60/this.tempo)*0.6);
            }
        }else if(localBeat===0&&Math.random()<0.6){
            this._playBass(this._scaleNote(root,-2),(60/this.tempo)*2);
        }

        if(localBeat%2===0){
            var arpPool=sec==='chorus'?[0,2,4,5,7,9]:[0,2,4,7];
            var arpDeg=arpPool[this.beat%arpPool.length]+root;
            var arpOct=(localBeat<8)?0:1;
            var arpVol=I==='menu'?0.09:sec==='chorus'?0.13:sec==='bridge'?0.06:0.10;
            if(sec!=='bridge'||localBeat%4===0)
                this._playNote(this._scaleNote(arpDeg,arpOct),'triangle',0.22,arpVol,0.01,0.04,0.4,0.25);
        }

        if(I!=='menu'&&sec!=='bridge'){
            var melBeat=localBeat%4;
            if(melBeat===0&&this.motif.length>0){
                var mi=this.motifTimer%this.motif.length;
                var note=this.motif[mi];
                this.motifTimer++;
                if(!note.rest){
                    var melDeg=note.degree+root;
                    var melOct=sec==='chorus'?1:0;
                    // Occasionally embellish
                    if(Math.random()<0.2)melDeg+=Math.random()>0.5?1:-1;
                    this._playNote(this._scaleNote(melDeg,melOct),'triangle',note.dur,0.16,0.02,0.06,0.35,0.35);
                }
            }
            // Secondary melody in chorus
            if(sec==='chorus'&&localBeat===8&&Math.random()>0.4){
                var secMel=[2,4,5,7][~~(Math.random()*4)]+root;
                this._playNote(this._scaleNote(secMel,1),'sine',0.4,0.09,0.03,0.08,0.3,0.4);
            }
        }

        if(localBeat===3&&Math.random()>0.65){
            var bellDeg=[4,7,9][~~(Math.random()*3)]+root;
            this._playNote(this._scaleNote(bellDeg,2),'sine',0.55,0.055,0.01,0.08,0.25,0.45);
        }
        if(sec==='bridge'&&localBeat===11&&Math.random()>0.5){
            var bDeg=[0,3,5][~~(Math.random()*3)]+root;
            this._playNote(this._scaleNote(bDeg,2),'sine',0.8,0.04,0.02,0.1,0.3,0.6);
        }

        if(I==='player'||I==='enemy'){
            if(localBeat===0||localBeat===8)this._playPerc(0.04,'kick');
            if(localBeat===4||localBeat===12)this._playPerc(0.035,'hat');
            if(rhythmHit&&localBeat%2===1)this._playPerc(0.02,'hat');
            // Fill at end of section
            if(this.beat%64>56&&localBeat%2===0)this._playPerc(0.025,'hat');
        }
        if(I==='menu'&&localBeat===0&&Math.random()<0.5)this._playPerc(0.012,'hat');
        if(I==='victory'){
            if(localBeat%2===0)this._playPerc(0.03,'kick');
            if(localBeat%4===2)this._playPerc(0.03,'hat');
        }

        if((sec==='bridge'||I==='menu')&&localBeat===0&&this.barCount%2===0){
            var texDeg=root+(Math.random()>0.5?4:7);
            this._playNote(this._scaleNote(texDeg,1),'sine',(60/this.tempo)*6,0.03,3.0,0.5,0.4,3.0);
        }
    }
}

// ── REPLACE GLOBAL BGM ──
_wasPlaying=typeof bgm!=='undefined'&&bgm&&bgm.isPlaying;
var _oldIntensity=(typeof bgm!=='undefined'&&bgm)?bgm.intensity:'menu';
if(_wasPlaying&&bgm.stop)bgm.stop();
window.bgm=new MaestroV4();
bgm.intensity=_oldIntensity||'menu';
if(_wasPlaying&&typeof S!=='undefined'&&S.soundOn)bgm.start();

// Re-hook visibility handler


// Exports
export { zzfx, zzfxG, sfx, MaestroV4 };
