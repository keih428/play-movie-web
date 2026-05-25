import { NextRequest, NextResponse } from "next/server";
import { getStaffAppSettings, saveStaffAppSettings } from "@/lib/server/app-settings-store";

export async function GET() {
  const settings = await getStaffAppSettings();
  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    defaultWorkspaceId?: string;
    defaultWorkspaceName?: string;
    landingMessage?: string;
  };

  const settings = await saveStaffAppSettings({
    defaultWorkspaceId: payload.defaultWorkspaceId,
    defaultWorkspaceName: payload.defaultWorkspaceName,
    landingMessage: payload.landingMessage,
  });

  return NextResponse.json({ settings });
}
