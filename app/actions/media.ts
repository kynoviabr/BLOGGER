"use server";

import { revalidatePath } from "next/cache";
import { MediaService } from "@/services/media.service";

export async function deleteMediaAction(id: string) {
  await MediaService.deleteMedia(id);
  revalidatePath("/media");
}
