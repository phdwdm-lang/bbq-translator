"use client";

import Image from "next/image";

export function AboutTab() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-200">
            B
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">BBQ Translator</h3>
            <p className="text-xs text-slate-400">Borderless Books Quickly</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          上传生肉漫画，自动去字、翻译、嵌字，为您端上热腾腾的熟肉。开箱即用。
        </p>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h4 className="text-xs font-bold text-slate-700 mb-3">加入交流群</h4>
        <p className="text-xs text-slate-500 mb-4">
          遇到问题或想交流使用心得？扫描下方二维码加入官方 QQ 交流群。
        </p>
        <div className="flex justify-center">
          <div className="relative w-48 h-48 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
            <Image
              src="/images/qq_group.png"
              alt="QQ交流群二维码"
              fill
              className="object-contain p-2"
              unoptimized
            />
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">扫码加入 QQ 交流群</p>
      </div>
    </div>
  );
}
