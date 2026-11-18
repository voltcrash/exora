"""Render Exora's catalog contact sheet in Blender's Python Console using runpy.run_path."""
from math import asin, cos, exp, hypot, sin, sqrt
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, noise

# Name, material family and two artist-selected display swatches.
subjects = """
Sun star ff9b43 fffbe5
Mercury crater 665754 dbd3c3
Venus vapor b28240 f8dfa8
Earth ocean 1c5083 94a37c
Mars rock 85432e e5a171
Jupiter bands 965e52 f2d9b8
Saturn rings b89769 f1dfb7
Uranus vapor 64b2ba bce3df
Neptune vapor 477ba1 a0c7db
Ceres crater 5b5756 a9a49b
Pluto rock 8e6d66 dac8b1
Eris neutral a6a3a2 e6e2de
Haumea neutral 9ca4ab d7d8d7
Makemake neutral 917561 dbb594
Moon crater 665f5b cbc8bb
Phobos crater 514946 a7907e
Deimos crater 7a675f b8a995
Io rock 966543 e3c05e
Europa ice 9d7968 e3d9bd
Ganymede rock 7a665d c4b69c
Callisto crater 4b4540 c0b6a0
Mimas crater 878285 d3cfcc
Enceladus ice a8b8c3 e6edf0
Tethys ice 9e9da4 e1dddc
Dione ice 85888d d9d5cf
Rhea crater 827f83 cbc9c3
Titan vapor 9f692e e5bc71
Iapetus rock 4e4034 c6bfb0
Miranda ice 7f8b93 c4c5be
Ariel ice 8f969c d4d7d3
Umbriel crater 555358 998e8e
Titania rock 8d7771 cfbbb1
Oberon crater 76635f c2aaa2
Triton ice 938078 d8c2bb
Charon crater 766c68 b9b3a7
Rocky rock 735951 cbb099
Giant bands 8e7159 f0dbb5
IceGiant vapor 457c91 bbdad9
Stellar star ffba80 fff7ea
Horizon horizon c26345 fff2c8
""".strip().splitlines()
side, columns, rows = 384, 8, 5
sheet = np.zeros((rows * side, columns * side, 4), dtype=np.float32)
light = Vector((-.66,.48,.57)).normalized()

def swatch(code):
    return np.array([int(code[i:i+2],16)/255 for i in (0,2,4)])

for i, subject in enumerate(subjects):
    name, family, dark, pale = subject.split()
    dark, pale = swatch(dark), swatch(pale)
    row, column = divmod(i,columns)
    shift = Vector((i*.713,3.9-i*.271,-1.3+i*.469))
    for y in range(side):
        for x in range(side):
            u, v = ((x+.5)/side-.5)*2, ((y+.5)/side-.5)*2
            angle = .24 if family == "rings" else -.17
            a,b = u*cos(angle)+v*sin(angle),v*cos(angle)-u*sin(angle)
            if family == "horizon":
                rho=hypot(a,b)
                curve=hypot(a, b/.27)
                front = exp(-((curve-.66)/.11)**2)
                arc=exp(-((rho-.355)/.032)**2) * max(0,b*4+.35)
                if b>0 and rho<.34: front=0
                fire=max(front,arc)*(.65+.25*sin(curve*96+a*4))*(1-.30*a)
                if fire<.008: continue
                tint=dark+(pale-dark)*min(1.,fire)
                alpha=min(1.,fire*1.9)
            else:
                radius = .59 if family=="rings" else .81
                nx,ny=a/radius,b/radius/(.61 if name=="Haumea" else 1)
                r=nx*nx+ny*ny
                ann=hypot(u*cos(.35)+v*sin(.35),(v*cos(.35)-u*sin(.35))/.29)
                ring=family=="rings" and .71<ann<.99
                if ring and (r>1 or v*cos(.35)-u*sin(.35)<0):
                    tint=pale*(.69+.16*sin(ann*340)+.07*cos(ann*712))
                    alpha=.26 if .841<ann<.855 else .89
                elif r<=1:
                    nz=sqrt(max(0,1-r)); p=Vector((nx,ny,nz))
                    sample=p+shift
                    f=noise.fractal(sample*3.2,1.05,2.1,5,noise_basis="PERLIN_NEW")
                    grain=noise.fractal(sample*16,.95,2.,3,noise_basis="PERLIN_NEW")
                    amount=.5+.34*f+.17*grain
                    if family in ("bands","rings","vapor"):
                        stripe=sin(asin(ny)*25+1.4*f+.4*grain)
                        amount=.53+(.24 if family=="bands" else .11)*stripe+.15*f+.06*grain
                    elif family=="ice": amount=.68-.36*exp(-abs(grain)*12)+.16*f
                    elif family=="neutral": amount=.55+.036*f
                    elif family=="crater":
                        d,_=noise.voronoi(sample*16)
                        amount+=.22*exp(-((d[0]-.38)/.075)**2)-.18*exp(-(d[0]/.31)**2)
                    elif family=="ocean": amount=1 if f>.15 else .1
                    tint=dark+(pale-dark)*max(0,min(1,amount))
                    if family=="ocean" and grain+.44*f>.51: tint=.4*tint+.6*np.ones(3)
                    illumination=.14+.91*max(0,p.dot(light))**.67
                    if family=="star":
                        tint=.36*tint+.64*pale
                        illumination=(.77+.33*nz)*(.94+.11*grain)
                    tint=tint*illumination;alpha=min(1.,(1-r)*side)
                else: continue
            sheet[(rows-1-row)*side+y,column*side+x,:3]=np.clip(tint,0,1)
            sheet[(rows-1-row)*side+y,column*side+x,3]=alpha

path=Path(__file__).resolve().parents[1]/"apps/website/public/textures/catalog-portraits.webp"
im=bpy.data.images.new("Exora catalog contact sheet",side*columns,side*rows,alpha=True)
im.colorspace_settings.name="sRGB"
im.alpha_mode="STRAIGHT"
im.pixels.foreach_set(sheet.ravel())
im.filepath_raw=str(path)
im.file_format="WEBP"
im.save()
print("Catalog contact sheet saved:", len(subjects), "portraits,", tuple(im.size))
