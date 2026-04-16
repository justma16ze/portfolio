/**
 * hexcore.js — Speedrun cube brand mark.
 * Sharp cube at rest. Morphs to crystal when agitated. Explodes on rapid clicks.
 * Adapts color to portfolio's --accent CSS variable.
 * Handles dark and light backgrounds automatically.
 * Loads Three.js v0.160 UMD from CDN.
 *
 * Usage: SpeedrunHexcore.init(canvasElement, { size: 48 })
 */
(function(global) {
  'use strict';

  var THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';

  function loadScript(url) {
    return new Promise(function(resolve, reject) {
      if (global.THREE) { resolve(); return; }
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function noise3d(x,y,z) {
    var p = x*1.7+y*2.3+z*3.1;
    return Math.sin(p)*Math.cos(p*0.7+1.3)*Math.sin(p*0.3+2.1);
  }
  function lerp(a,b,t){return a+(b-a)*t;}
  function smoothstep(t){return t<0?0:t>1?1:t*t*(3-2*t);}

  function getAccentColor() {
    var el = document.documentElement;
    var accent = getComputedStyle(el).getPropertyValue('--accent').trim();
    if (accent && accent !== '') return accent;
    var footer = document.querySelector('footer a');
    if (footer) { var c = getComputedStyle(footer).color; if (c) return c; }
    return '#22c55e';
  }

  function getBackgroundBrightness() {
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (!bg) bg = getComputedStyle(document.body).backgroundColor;
    try {
      var c = new THREE.Color(bg);
      var hsl = {}; c.getHSL(hsl);
      return hsl.l;
    } catch(e) { return 0.1; }
  }

  function init(canvas, opts) {
    opts = opts || {};
    var size = opts.size || 48;
    var interactive = opts.interactive !== false;

    return loadScript(THREE_CDN).then(function() {
      var T = global.THREE;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';

      var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(dpr);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;

      var scene = new T.Scene();
      var camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(1.8, 1.5, 2.2);
      camera.lookAt(0, 0, 0);

      var accentHex = getAccentColor();
      var accent = new T.Color(accentHex);
      var accentHSL = {}; accent.getHSL(accentHSL);
      var isDark = getBackgroundBrightness() < 0.3;

      // BoxGeometry: sharp cube
      var segs = size < 80 ? 6 : 10;
      var geo = new T.BoxGeometry(1, 1, 1, segs, segs, segs);
      var cubePos = geo.attributes.position.array.slice();
      var vc = cubePos.length / 3;

      var nOff = [];
      var explodeDir = new Float32Array(vc * 3);
      var explodeDist = new Float32Array(vc);
      for (var i = 0; i < vc; i++) {
        nOff.push({ox:Math.random()*100,oy:Math.random()*100,oz:Math.random()*100,freq:0.3+Math.random()*0.5});
        var cx=cubePos[i*3],cy=cubePos[i*3+1],cz=cubePos[i*3+2];
        var len=Math.sqrt(cx*cx+cy*cy+cz*cz)||0.001;
        explodeDir[i*3]=cx/len+(Math.random()-0.5)*0.4;
        explodeDir[i*3+1]=cy/len+(Math.random()-0.5)*0.4;
        explodeDir[i*3+2]=cz/len+(Math.random()-0.5)*0.4;
        explodeDist[i]=(size<100?0.4:1.5)+Math.random()*(size<100?0.6:2.5);
      }

      var cubeLightness = isDark ? 0.65 : 0.45;
      var mat = new T.MeshPhysicalMaterial({
        color: new T.Color().setHSL(accentHSL.h, accentHSL.s*0.5, cubeLightness),
        emissive: accent.clone().lerp(new T.Color('#fff'), isDark?0.3:0.1),
        emissiveIntensity: isDark ? 0.3 : 0.15,
        metalness: 0.4, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1,
        transparent: true, opacity: 0.95, side: T.DoubleSide, flatShading: true,
      });
      var mesh = new T.Mesh(geo, mat);
      scene.add(mesh);

      // Inner glow
      var igMat = new T.MeshBasicMaterial({color:accent.clone(),transparent:true,opacity:0,side:T.BackSide});
      mesh.add(new T.Mesh(new T.IcosahedronGeometry(0.4, 2), igMat));

      // Hot core
      var hotMat = new T.MeshBasicMaterial({color:'#fff',transparent:true,opacity:0});
      var hotCore = new T.Mesh(new T.SphereGeometry(0.06,8,8), hotMat);
      scene.add(hotCore);
      var coreLight = new T.PointLight(accent.clone(), 0, 4);
      scene.add(coreLight);

      // Lights
      scene.add(new T.DirectionalLight('#fff', 1.0).translateZ(3).translateY(4).translateX(2));
      var fillLight = new T.DirectionalLight(accent.clone().lerp(new T.Color('#fff'),0.4), 0.4);
      fillLight.position.set(-2,-1,3); scene.add(fillLight);
      var rimLight = new T.DirectionalLight(accent.clone().lerp(new T.Color('#fff'),0.5), 0.5);
      rimLight.position.set(-1,2,-3); scene.add(rimLight);
      scene.add(new T.AmbientLight(isDark?'#444':'#222', isDark?0.6:0.4));
      var orbitLight = new T.PointLight('#fff', 0.3, 5);
      scene.add(orbitLight);

      // Particles
      var pGeo, pMat, pCount = 0;
      if (size >= 48) {
        pCount = Math.min(20, Math.floor(size / 6));
        pGeo = new T.BufferGeometry();
        var pp = new Float32Array(pCount * 3);
        for (var j = 0; j < pCount; j++) {
          var th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI, r=1.2+Math.random()*0.8;
          pp[j*3]=r*Math.sin(ph)*Math.cos(th); pp[j*3+1]=r*Math.cos(ph); pp[j*3+2]=r*Math.sin(ph)*Math.sin(th);
        }
        pGeo.setAttribute('position', new T.BufferAttribute(pp, 3));
        pMat = new T.PointsMaterial({color:accent.clone(),size:size<80?0.025:0.012,transparent:true,opacity:0.2,blending:T.AdditiveBlending});
        scene.add(new T.Points(pGeo, pMat));
      }

      // State
      var energy=0, targetEnergy=0, lastClick=-99, time=0;
      var morphAmount=0, explodeAmount=0;
      var exploded=false, explodeTime=0;
      var clickWindow = [];
      var rotSpeed={x:0.001+Math.random()*0.002,y:0.003+Math.random()*0.003,z:0.0005+Math.random()*0.001};
      var rotTarget={x:rotSpeed.x,y:rotSpeed.y,z:rotSpeed.z};
      var rotTimer=0;

      if (interactive) {
        canvas.addEventListener('click', function(){
          clickWindow.push(time);
          clickWindow=clickWindow.filter(function(t){return time-t<2;});
          targetEnergy=Math.min(1,energy+0.15+clickWindow.length*0.05);
          lastClick=time;
          if(clickWindow.length>=6&&!exploded){exploded=true;explodeTime=time;}
        });
        canvas.addEventListener('mouseenter', function(){if(!exploded)targetEnergy=Math.max(targetEnergy,0.3);});
        canvas.addEventListener('mouseleave', function(){if(time-lastClick>1&&!exploded)targetEnergy=0;});
      }

      function animate() {
        requestAnimationFrame(animate);
        time += 0.016;

        if(!exploded&&time-lastClick>2) targetEnergy=Math.max(0,targetEnergy-0.004);
        energy+=(targetEnergy-energy)*0.04;

        // Explosion timeline
        if(exploded){
          var since=time-explodeTime;
          if(since<1.2) explodeAmount=lerp(explodeAmount,1,0.06);
          else if(since<3) explodeAmount=lerp(explodeAmount,1,0.02);
          else if(since<8) explodeAmount=lerp(explodeAmount,0,0.015);
          else{explodeAmount=lerp(explodeAmount,0,0.03);
            if(explodeAmount<0.002){explodeAmount=0;exploded=false;energy=0.15;targetEnergy=0.1;clickWindow=[];}}
        }

        // Morph amount follows energy but decays very slowly out of explosion
        // so there's no snap when exploded flips to false
        var morphTarget = exploded ? 0.5+explodeAmount*0.5 : Math.min(energy,0.85);
        morphAmount += (morphTarget - morphAmount) * 0.03;

        // Tumble
        rotTimer+=0.016;
        if(rotTimer>5+Math.random()*5){rotTimer=0;
          var s=0.001+morphAmount*0.008;
          rotTarget.x=s*(0.5+Math.random())*(Math.random()>0.5?1:-1);
          rotTarget.y=s*(1+Math.random())*(Math.random()>0.5?1:-1);
          rotTarget.z=s*(0.3+Math.random())*(Math.random()>0.5?1:-1);
        }
        rotSpeed.x+=(rotTarget.x-rotSpeed.x)*0.008;
        rotSpeed.y+=(rotTarget.y-rotSpeed.y)*0.008;
        rotSpeed.z+=(rotTarget.z-rotSpeed.z)*0.008;
        mesh.rotation.x+=rotSpeed.x*(1+energy*2);
        mesh.rotation.y+=rotSpeed.y*(1+energy*2);
        mesh.rotation.z+=rotSpeed.z*(1+energy*2);

        // Zoom camera out during explosion so pieces stay in view
        var camDist = 2.2 + explodeAmount * (size<100?1.5:3);
        var camScale = camDist / 2.2;
        camera.position.set(1.8*camScale, 1.5*camScale, 2.2*camScale);
        camera.lookAt(0,0,0);

        // Vertex morph + explode
        var m=smoothstep(morphAmount), e=smoothstep(explodeAmount);
        var pos=geo.attributes.position.array;
        var breath=1+Math.sin(time*(0.3+energy*0.6))*(morphAmount*0.04);

        for(var i=0;i<vc;i++){
          var ix=i*3,iy=i*3+1,iz=i*3+2;
          var cx2=cubePos[ix],cy2=cubePos[iy],cz2=cubePos[iz];
          var vlen=Math.sqrt(cx2*cx2+cy2*cy2+cz2*cz2)||0.001;
          var nx=cx2/vlen,ny=cy2/vlen,nz=cz2/vlen;
          var n=nOff[i];
          var disp=0.15*noise3d(nx*3+time*0.3*n.freq+n.ox,ny*3+time*0.3*n.freq*0.7,nz*3+time*0.3*n.freq*0.5+n.oy);
          disp+=0.25*Math.max(energy,explodeAmount)*noise3d(nx*6+time*0.5*n.freq+n.oz,ny*6+time*0.2,nz*6+n.ox);
          var cr=0.62*(1+disp);
          var intX=lerp(cx2,nx*cr,m)*breath,intY=lerp(cy2,ny*cr,m)*breath,intZ=lerp(cz2,nz*cr,m)*breath;
          pos[ix]=intX+explodeDir[ix]*explodeDist[i]*e+(e>0.1?Math.sin(time*2+n.ox)*0.05*e:0);
          pos[iy]=intY+explodeDir[iy]*explodeDist[i]*e+(e>0.1?Math.cos(time*1.7+n.oy)*0.05*e:0);
          pos[iz]=intZ+explodeDir[iz]*explodeDist[i]*e+(e>0.1?Math.sin(time*2.3+n.oz)*0.03*e:0);
        }
        geo.attributes.position.needsUpdate=true;
        geo.computeVertexNormals();

        // Material
        var hue=accentHSL.h+Math.sin(time*0.1)*0.015;
        var restL=isDark?0.65:0.45;
        mat.color.setHSL(hue,lerp(accentHSL.s*0.5,accentHSL.s*0.8,m),lerp(restL,0.35,m));
        mat.emissive.setHSL(hue,accentHSL.s*0.9,lerp(isDark?0.2:0.1,0.3+e*0.15,m));
        mat.emissiveIntensity=lerp(isDark?0.3:0.15,0.5+e*0.3,m);
        mat.metalness=lerp(0.4,0.12,m);
        mat.roughness=lerp(0.3,0.06,m);
        mat.opacity=lerp(0.95,0.5-e*0.15,m);
        mat.transmission=m>0.2?(m-0.2)*0.7:0;
        if(mat.transmission>0){mat.thickness=1.2;mat.ior=1.8;}

        // Inner glow + hot core
        var g=Math.max(m,e*0.8);
        igMat.opacity=g>0.15?(g-0.15)*0.5:0;
        igMat.color.copy(accent).lerp(new T.Color('#fff'),0.2);
        hotCore.position.set(Math.sin(time*0.4)*0.08,Math.cos(time*0.31)*0.08,Math.sin(time*0.23)*0.05);
        hotCore.scale.setScalar(g>0.1?0.3+g+Math.sin(time*2.3)*0.15*g:0);
        hotMat.opacity=g>0.1?Math.min(0.9,g*1.2):0;
        coreLight.position.copy(hotCore.position);
        coreLight.color.copy(accent).lerp(new T.Color('#fff'),0.3);
        coreLight.intensity=g>0.1?g*5:0;

        // Lights
        fillLight.color.copy(accent).lerp(new T.Color('#fff'),0.4);
        rimLight.color.copy(accent).lerp(new T.Color('#fff'),0.5);
        orbitLight.position.set(Math.sin(time*0.5)*2,Math.cos(time*0.37)*1.5,Math.sin(time*0.23)*2);
        orbitLight.intensity=0.3+energy+e*0.5;

        // Particles
        if(pGeo){
          var pa=pGeo.attributes.position.array;
          for(var k=0;k<pCount;k++){var kx=k*3,ky=k*3+1,kz=k*3+2;var dx=-pa[kx],dy=-pa[ky],dz=-pa[kz];var dd=Math.sqrt(dx*dx+dy*dy+dz*dz);
            if(e>0.3){pa[kx]+=(Math.random()-0.5)*0.04*e;pa[ky]+=(Math.random()-0.5)*0.04*e;pa[kz]+=(Math.random()-0.5)*0.04*e;}
            else if(dd>0.5){pa[kx]+=dx/dd*(0.001+energy*0.003);pa[ky]+=dy/dd*0.001;pa[kz]+=dz/dd*0.001;}
            else{var th2=Math.random()*Math.PI*2,ph2=Math.random()*Math.PI,r2=1.2+Math.random()*0.7;pa[kx]=r2*Math.sin(ph2)*Math.cos(th2);pa[ky]=r2*Math.cos(ph2);pa[kz]=r2*Math.sin(ph2)*Math.sin(th2);}}
          pGeo.attributes.position.needsUpdate=true;
          pMat.color.copy(accent);
          pMat.opacity=0.15+Math.max(energy,e)*0.4;
        }

        renderer.render(scene, camera);
      }
      animate();
    });
  }

  global.SpeedrunHexcore = { init: init };
})(window);
