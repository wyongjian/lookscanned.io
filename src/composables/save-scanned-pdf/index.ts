import type { Ref } from "vue";
import { get } from "@vueuse/core";
import { ref, computed } from "vue";

interface PDFRenderer {
  renderPage(
    page: number,
    scale: number
  ): Promise<{
    blob: Blob;
  }>;
  getNumPages(): Promise<number>;
}

interface ScanRenderer {
  renderPage(image: Blob): Promise<{
    blob: Blob;
    height: number;
    width: number;
  }>;
}

export function useSaveScannedPDF(
  pdfRenderer: PDFRenderer | undefined | Ref<PDFRenderer | undefined>,
  scanRenderer: ScanRenderer | undefined | Ref<ScanRenderer | undefined>,
  scale: Ref<number> | number
) {
  const finishedPages = ref(0);
  const totalPages = ref(0);
  const progress = computed(() => {
    if (totalPages.value === 0) {
      return 0;
    }
    return finishedPages.value / totalPages.value;
  });

  const saving = ref(false);

  const save = async () => {
    try {
      finishedPages.value = 0;
      totalPages.value = 0;
      saving.value = true;

      const pdf = get(pdfRenderer);
      const scan = get(scanRenderer);
      const scale_ = get(scale);

      if (!pdf || !scan) {
        throw new Error("No PDF or Scan Renderer");
      }

      const numPages = await pdf.getNumPages();

      totalPages.value = numPages;

      // generate pdf pages 1...n
      const pages = Array.from({ length: numPages }, (_, i) => i + 1);
      const scanPages = await Promise.all(
        pages.map(async (page) => {
          const pdfPage = (await pdf.renderPage(page, scale_)).blob;
          const scanPage = await scan.renderPage(pdfPage);
          finishedPages.value += 1;
          return {
            ...scanPage,
            dpi: scale_ * 72,
          };
        })
      );

      // generate pdf from scan pages
      const { imagesToPDF } = await import("@/utils/images-to-pdf");
      const pdfDocument = await imagesToPDF(scanPages);

      return pdfDocument;
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      saving.value = false;
    }
  };

  return { save, progress, saving };
}
