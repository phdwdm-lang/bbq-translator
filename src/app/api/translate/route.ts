import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

// 强行指定代理，确保连接畅通
process.env.HTTP_PROXY = "http://127.0.0.1:7890";
process.env.HTTPS_PROXY = "http://127.0.0.1:7890";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt } = await req.json();
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 📋 最终修正的模型清单 (只用精准版本号)
    const modelCandidates = [
      "gemini-1.5-flash-002",  // 优先尝试最新版
      "gemini-1.5-flash-001",  // 其次尝试初始版 (最稳，永不下架)
      "gemini-1.5-pro-002",    // 尝试 Pro 版
      "gemini-pro"             // 最后兜底
    ];

    let text = "";
    let lastError: unknown = null;

    for (const modelName of modelCandidates) {
      try {
        console.log(`[Server] 正在请求模型: ${modelName} ...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
        ]);
        
        const response = await result.response;
        text = response.text();
        
        if (text) {
          console.log(`✅ 成功！模型 ${modelName} 立大功了！`);
          break;
        }
      } catch (err: unknown) {
        // 如果是额度不足(429)或者找不到(404)，就跳过试下一个
        const msg = err instanceof Error ? err.message : String(err ?? "");
        console.warn(`⚠️ 模型 ${modelName} 不可用: ${msg.substring(0, 100)}...`);
        lastError = err;
      }
    }

    if (!text) {
      // 如果实在不行，打印一个帮助信息
      console.error("❌ 所有模型都失败了。请检查你的 API Key 是否开通了 Google AI Studio 的免费计划。");
      throw lastError || new Error("无可用的模型");
    }

    return NextResponse.json({ text });

  } catch (error: unknown) {
    console.error("[Server Error]", error);
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}