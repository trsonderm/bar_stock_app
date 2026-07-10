import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

interface GeneratedObject {
    id: string;
    type: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    shelves: any[];
    doorDirection: string;
    notes: string;
}

// Simple heuristic parser when no OpenAI key is available
function parseDescription(text: string): { map_data: any; description: string } {
    const lower = text.toLowerCase();

    // Extract dimensions
    let width = 40;
    let height = 20;
    const dimMatch = lower.match(/(\d+)\s*(?:by|x|×|by)\s*(\d+)\s*(?:foot|feet|ft)?/);
    if (dimMatch) {
        width = parseInt(dimMatch[1]);
        height = parseInt(dimMatch[2]);
    } else {
        // Single number followed by "foot" or "feet" suggests square
        const singleMatch = lower.match(/(\d+)\s*(?:foot|feet|ft)\s*(?:square|bar)/);
        if (singleMatch) { width = parseInt(singleMatch[1]); height = width; }
    }

    const objects: GeneratedObject[] = [];
    let nextId = 1;
    const id = () => `obj_${nextId++}`;

    // Detect bar counter
    if (/bar counter|bar top|main bar|front bar/.test(lower)) {
        objects.push({ id: id(), type: 'bar_counter', name: 'Bar Counter', x: 2, y: height - 6, width: width - 4, height: 3, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Detect back bar / bottle rows
    const bottleRowCount = (lower.match(/bottle row|shelf row|liquor shelf|back bar shelf/g) || []).length;
    const rowCount = bottleRowCount || (/back bar|bottle shelf/.test(lower) ? 2 : 0);
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
        objects.push({ id: id(), type: 'bottle_row', name: `Shelf Row ${i + 1}`, x: 2, y: i * 2, width: width - 4, height: 1.5, rotation: 0, shelves: [{ id: `s${nextId}`, label: 'Top', products: [] }, { id: `s${nextId + 1}`, label: 'Middle', products: [] }, { id: `s${nextId + 2}`, label: 'Bottom', products: [] }], doorDirection: 's', notes: '' });
    }

    // Ice wells
    const iceCount = (lower.match(/ice well|ice bin/g) || []).length || (/ice/.test(lower) ? 1 : 0);
    for (let i = 0; i < Math.min(iceCount, 3); i++) {
        objects.push({ id: id(), type: 'ice_well', name: `Ice Well ${iceCount > 1 ? i + 1 : ''}`.trim(), x: 4 + i * 6, y: height - 9, width: 3, height: 2, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Register
    if (/register|pos|point of sale|cash/.test(lower)) {
        objects.push({ id: id(), type: 'register', name: 'Register', x: width - 6, y: height - 9, width: 4, height: 3, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Liquor room
    if (/liquor room|liquor storage|storeroom|stock room/.test(lower)) {
        objects.push({ id: id(), type: 'liquor_room', name: 'Liquor Room', x: width - 12, y: 0, width: 12, height: 10, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Cooler
    if (/cooler|walk.in|refrigerat/.test(lower)) {
        objects.push({ id: id(), type: 'cooler', name: 'Walk-in Cooler', x: 0, y: 0, width: 10, height: 8, rotation: 0, shelves: [], doorDirection: 'e', notes: '' });
    }

    // Office
    if (/office/.test(lower)) {
        objects.push({ id: id(), type: 'office', name: 'Office', x: 0, y: 0, width: 8, height: 6, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Bathroom(s)
    const bathCount = (lower.match(/bathroom|restroom|washroom|toilet/g) || []).length;
    if (bathCount) {
        objects.push({ id: id(), type: 'bathroom', name: 'Restroom', x: width - 8, y: 0, width: 8, height: 6, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Doors
    if (/entrance|front door|exit|door/.test(lower)) {
        objects.push({ id: id(), type: 'door', name: 'Main Entrance', x: Math.floor(width / 2) - 2, y: 0, width: 4, height: 1, rotation: 0, shelves: [], doorDirection: 's', notes: '' });
    }

    // Default outline = rectangle of the whole space
    const outline = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];

    return {
        map_data: { name: 'My Bar', width_ft: width, height_ft: height, grid_ft: 1, outline, objects },
        description: `Generated from voice: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`,
    };
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { transcript } = await req.json();
    if (!transcript?.trim()) return NextResponse.json({ error: 'transcript required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
        try {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: `You are a bar floor-plan generator. Given a verbal description of a bar space, output a JSON map_data object.
The JSON must have:
  name: string
  width_ft: number (total width in feet)
  height_ft: number (total height in feet)
  grid_ft: 1
  outline: [{x,y}] polygon of the room boundary in feet
  objects: array of objects, each with:
    id: "obj_N" (sequential)
    type: one of: bar_counter, ice_well, register, bottle_row, mixer_row, back_bar, sink, liquor_room, cooler, office, bathroom, door, window, pillar, table, service_area
    name: string
    x, y: position in feet from top-left
    width, height: size in feet
    rotation: 0
    shelves: [] (for bottle_row/mixer_row/liquor_room/cooler, add shelf objects with id,label,products:[])
    doorDirection: "n","s","e","w"
    notes: ""
Place objects logically based on the description. Bar counter usually runs along a wall. Bottle rows go behind bar counter. Use real-world typical dimensions.`
                        },
                        { role: 'user', content: transcript },
                    ],
                }),
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                const raw = aiData.choices?.[0]?.message?.content;
                const parsed = JSON.parse(raw);
                const map_data = parsed.map_data || parsed;
                return NextResponse.json({ ok: true, map_data, description: `AI generated from voice description` });
            }
        } catch {
            // fall through to heuristic parser
        }
    }

    // Fallback: heuristic parser
    const { map_data, description } = parseDescription(transcript);
    return NextResponse.json({ ok: true, map_data, description });
}
