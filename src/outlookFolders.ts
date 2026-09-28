// "Folders → Outlook Client" (James's ask, and his follow-up: make it "really easy for someone
// who licenses the software to action"). A browser sandboxed web app has no way to reach a
// desktop application directly -- there is no API a page can call into a locally-running Outlook
// process -- so the only way to automate desktop Outlook at all is code that runs INSIDE Outlook
// itself. A one-time VBA macro import is the lowest-friction version of that available without
// building and publishing a full, signed Outlook Add-in (a bigger, separate project worth doing
// later once there's real demand for this path specifically -- most subscription-era Microsoft
// 365 users are better served by "Outlook 365"'s one-click "Sign in with Microsoft" flow instead,
// once that's set up).
//
// The bridge between the two: this app exports a plain list of folder paths (one per line, "\"
// separated, matching Outlook's own folder-path convention); the macro reads that file and
// creates the matching nested mail folders under whichever folder the user has selected in
// Outlook's own folder pane.

import type { HddFolderPlanRow } from './hddFolders';

export function buildOutlookFolderPathList(plan: HddFolderPlanRow[]): string {
  return plan.map((row) => row.pathSegments.join('\\')).join('\r\n');
}

// A real, working Outlook VBA macro (import via Outlook's own Developer tab -> Visual Basic ->
// File -> Import File...) -- not a placeholder. Deliberately simple: it reads whichever folder
// is currently selected in Outlook's folder pane as its destination root (so there's no folder-
// picker UI to write in VBA at all -- the user just clicks the folder they want first), asks for
// the exported folder-list file, and walks each line creating any folder in the path that doesn't
// already exist yet -- safe to re-run, exactly like the Local Hard Drive feature.
export const OUTLOOK_MACRO_VBA = `Option Explicit

' Taxonomy Builder -- Create Outlook Folders
' Installed once via Outlook's Developer tab -> Visual Basic -> File -> Import File...
' To run: click the destination folder in Outlook's own folder pane first, then run this macro
' (Developer tab -> Macros -> CreateTaxonomyFolders), and choose the folder-list .txt file
' exported from Taxonomy Builder (Folders -> Outlook Client -> Download Folder List).

Sub CreateTaxonomyFolders()
    Dim rootFolder As Outlook.MAPIFolder
    Dim fd As Object
    Dim filePath As String
    Dim fileNum As Integer
    Dim lineText As String
    Dim processedCount As Long

    On Error Resume Next
    Set rootFolder = Application.ActiveExplorer.CurrentFolder
    On Error GoTo 0
    If rootFolder Is Nothing Then
        MsgBox "Please select a folder in Outlook's folder pane first (this is where the new folders will be created), then run this macro again.", vbExclamation, "Taxonomy Builder"
        Exit Sub
    End If

    Set fd = Application.FileDialog(3) ' msoFileDialogFilePicker
    fd.Title = "Choose the folder list exported from Taxonomy Builder"
    fd.Filters.Clear
    fd.Filters.Add "Text Files", "*.txt"
    fd.AllowMultiSelect = False
    If fd.Show <> -1 Then Exit Sub ' user cancelled
    filePath = fd.SelectedItems(1)

    If MsgBox("Create the taxonomy's folder structure under """ & rootFolder.Name & """?", vbYesNo + vbQuestion, "Taxonomy Builder") <> vbYes Then Exit Sub

    fileNum = FreeFile
    Open filePath For Input As #fileNum
    Do Until EOF(fileNum)
        Line Input #fileNum, lineText
        If Trim(lineText) <> "" Then
            EnsureOutlookFolderPath rootFolder, Trim(lineText)
            processedCount = processedCount + 1
        End If
    Loop
    Close #fileNum

    MsgBox "Done -- processed " & processedCount & " folder path(s) under """ & rootFolder.Name & """.", vbInformation, "Taxonomy Builder"
End Sub

Private Sub EnsureOutlookFolderPath(ByVal rootFolder As Outlook.MAPIFolder, ByVal pathText As String)
    Dim parts() As String
    Dim current As Outlook.MAPIFolder
    Dim nextFolder As Outlook.MAPIFolder
    Dim i As Long

    parts = Split(pathText, "\\")
    Set current = rootFolder
    For i = LBound(parts) To UBound(parts)
        Set nextFolder = Nothing
        On Error Resume Next
        Set nextFolder = current.Folders.Item(parts(i))
        On Error GoTo 0
        If nextFolder Is Nothing Then
            Set nextFolder = current.Folders.Add(parts(i))
        End If
        Set current = nextFolder
    Next i
End Sub
`;
