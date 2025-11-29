import xml.etree.ElementTree as ET
import sys
import os

def is_completed_or_dropped(node):
    """
    Check if a TaskNode is completed or dropped.
    """
    # Check CompletionDateTime
    completion_date = node.find('CompletionDateTime')
    if completion_date is not None and completion_date.text:
        return True

    # Check Dropped status (Child element or Attribute)
    # MLO often uses a child element <Dropped>true</Dropped>
    dropped = node.find('Dropped')
    if dropped is not None and dropped.text and dropped.text.lower() == 'true':
        return True
        
    # Also check attribute just in case
    if node.get('Dropped') == 'true':
        return True

    return False

def filter_node(node):
    """
    Recursively filter children of a node.
    Returns True if the node itself should be kept (based on its children),
    but the decision to keep the node itself is made by its parent.
    This function modifies the node by removing children that should be dropped.
    """
    # We need to iterate over a copy of the children list to modify it safely
    children = list(node)
    
    for child in children:
        if child.tag == 'TaskNode':
            # If child is completed/dropped, remove it (and its subtree)
            if is_completed_or_dropped(child):
                node.remove(child)
            else:
                # If child is active, recurse
                filter_node(child)
    
    return True

def compact_mlo_xml(input_file, output_file):
    try:
        tree = ET.parse(input_file)
        root = tree.getroot()
        
        # The structure is usually <MyLifeOrganized><TaskTree><TaskNode>...</TaskNode></TaskTree></MyLifeOrganized>
        # Or sometimes just <TaskTree> at root depending on export settings.
        # We look for TaskTree.
        
        task_tree = root.find('TaskTree')
        if task_tree is None:
            # Maybe root IS TaskTree?
            if root.tag == 'TaskTree':
                task_tree = root
            else:
                print("Error: Could not find TaskTree element.")
                return

        # Filter the TaskTree
        filter_node(task_tree)
        
        # Write output
        tree.write(output_file, encoding='utf-8', xml_declaration=True)
        print(f"Successfully compacted '{input_file}' to '{output_file}'")

    except ET.ParseError as e:
        print(f"Error parsing XML: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 compact_mlo.py <input_file> <output_file>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: Input file '{input_path}' not found.")
        sys.exit(1)

    compact_mlo_xml(input_path, output_path)
